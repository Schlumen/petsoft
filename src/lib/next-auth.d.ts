import { User } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: User & {
      id: string;
    };
  }
}

declare module "@auth/core/jwt" {
  export interface JWT {
    userId: string;
  }
}
