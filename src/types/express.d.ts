declare namespace Express {
  interface UserContext {
    id: number;
    role: "tenant" | "landlord" | "admin";
    name: string;
    email: string;
  }

  interface Request {
    user?: UserContext;
  }
}
