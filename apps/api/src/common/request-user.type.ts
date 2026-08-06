export type RequestUser = {
  id: string;
  username: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
};
