import { Db, Collection } from 'mongodb';
import { User, DatabaseInterfaceServicePassword } from '@accounts/types';
import merge from 'lodash.merge';
import { defaultOptions } from '../options';
import { toMongoID } from '../utils';
import { AccountsMongoOptions } from '../types';

export class MongoServicePassword implements DatabaseInterfaceServicePassword {
  // Db object
  private db: Db;
  // Options of Mongo class
  private options: AccountsMongoOptions & typeof defaultOptions;
  // User collection
  private userCollection: Collection;

  constructor(db: Db, options: AccountsMongoOptions) {
    this.db = db;
    this.options = merge({ ...defaultOptions }, options);
    this.userCollection = this.db.collection(this.options.collectionName);
  }

  public async setupIndexes(): Promise<void> {
    await this.userCollection.createIndex('username', {
      unique: true,
      sparse: true,
    });
    await this.userCollection.createIndex('emails.address', {
      unique: true,
      sparse: true,
    });
  }

  public async findUserByResetPasswordToken(token: string): Promise<User | null> {
    const user = await this.userCollection.findOne({
      'services.password.reset.token': token,
    });
    if (user) {
      user.id = user._id.toString();
    }
    return user;
  }

  public async findUserByEmailVerificationToken(token: string): Promise<User | null> {
    const user = await this.userCollection.findOne({
      'services.email.verificationTokens.token': token,
    });
    if (user) {
      user.id = user._id.toString();
    }
    return user;
  }

  public async findPasswordHash(userId: string): Promise<string | null> {
    const id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    const user = await this.userCollection.findOne({ _id: id });
    return user?.services?.password?.bcrypt || null;
  }

  public async setPassword(userId: string, newPassword: string): Promise<void> {
    const id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    const ret = await this.userCollection.updateOne(
      { _id: id },
      {
        $set: {
          'services.password.bcrypt': newPassword,
          [this.options.timestamps.updatedAt]: this.options.dateProvider(),
        },
        $unset: {
          'services.password.reset': '',
        },
      }
    );
    if (ret.result.nModified === 0) {
      throw new Error('User not found');
    }
  }

  public async addEmailVerificationToken(
    userId: string,
    email: string,
    token: string
  ): Promise<void> {
    const _id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    await this.userCollection.updateOne(
      { _id },
      {
        $push: {
          'services.email.verificationTokens': {
            token,
            address: email.toLowerCase(),
            when: this.options.dateProvider(),
          },
        },
      }
    );
  }

  public async addResetPasswordToken(
    userId: string,
    email: string,
    token: string,
    reason: string
  ): Promise<void> {
    const _id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    await this.userCollection.updateOne(
      { _id },
      {
        $push: {
          'services.password.reset': {
            token,
            address: email.toLowerCase(),
            when: this.options.dateProvider(),
            reason,
          },
        },
      }
    );
  }

  // TODO do we really need this function?
  public async setResetPassword(userId: string, email: string, newPassword: string): Promise<void> {
    await this.setPassword(userId, newPassword);
  }

  public async addEmail(userId: string, newEmail: string, verified: boolean): Promise<void> {
    const id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    const ret = await this.userCollection.updateOne(
      { _id: id },
      {
        $addToSet: {
          emails: {
            address: newEmail.toLowerCase(),
            verified,
          },
        },
        $set: {
          [this.options.timestamps.updatedAt]: this.options.dateProvider(),
        },
      }
    );
    if (ret.result.nModified === 0) {
      throw new Error('User not found');
    }
  }

  public async removeEmail(userId: string, email: string): Promise<void> {
    const id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    const ret = await this.userCollection.updateOne(
      { _id: id },
      {
        $pull: { emails: { address: email.toLowerCase() } },
        $set: {
          [this.options.timestamps.updatedAt]: this.options.dateProvider(),
        },
      }
    );
    if (ret.result.nModified === 0) {
      throw new Error('User not found');
    }
  }

  public async verifyEmail(userId: string, email: string): Promise<void> {
    const id = this.options.convertUserIdToMongoObjectId ? toMongoID(userId) : userId;
    const ret = await this.userCollection.updateOne(
      { _id: id, 'emails.address': email },
      {
        $set: {
          'emails.$.verified': true,
          [this.options.timestamps.updatedAt]: this.options.dateProvider(),
        },
        $pull: { 'services.email.verificationTokens': { address: email } },
      }
    );
    if (ret.result.nModified === 0) {
      throw new Error('User not found');
    }
  }
}