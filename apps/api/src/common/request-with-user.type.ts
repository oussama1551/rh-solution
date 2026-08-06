import { Request } from "express";
import { RequestUser } from "./request-user.type";

export type RequestWithUser = Request & {
  user?: RequestUser;
};
