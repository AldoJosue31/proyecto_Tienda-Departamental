export type LoginState = {
  message?: string;
  fieldErrors?: { email?: string[]; password?: string[] };
};

export const initialLoginState: LoginState = {};
