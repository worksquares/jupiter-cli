/**
 * Jupiter User Model - Matches existing user table structure
 */

export interface JupiterUser {
  id: string;  // varchar(200)
  pk?: number; // auto-increment primary key
  firstname: string;
  lastname: string;
  email: string;
  password?: string;
  planid?: string;
  planpk?: number;
  token?: string;
  auth?: any; // JSON field
  github_access_token?: string;
  github_selected_repo?: any; // JSON field
  otp?: string;
  isactive?: boolean;
}

export function jupiterUserFromRow(row: any): JupiterUser {
  return {
    id: row.id,
    pk: row.pk,
    firstname: row.firstname,
    lastname: row.lastname,
    email: row.email,
    password: row.password,
    planid: row.planid,
    planpk: row.planpk,
    token: row.token,
    auth: typeof row.auth === 'string' ? JSON.parse(row.auth) : row.auth,
    github_access_token: row.github_access_token,
    github_selected_repo: typeof row.github_selected_repo === 'string' 
      ? JSON.parse(row.github_selected_repo) 
      : row.github_selected_repo,
    otp: row.otp,
    isactive: Boolean(row.isactive)
  };
}

export function jupiterUserToRow(user: Partial<JupiterUser>): any {
  const row: any = {};
  
  if (user.id !== undefined) row.id = user.id;
  if (user.pk !== undefined) row.pk = user.pk;
  if (user.firstname !== undefined) row.firstname = user.firstname;
  if (user.lastname !== undefined) row.lastname = user.lastname;
  if (user.email !== undefined) row.email = user.email;
  if (user.password !== undefined) row.password = user.password;
  if (user.planid !== undefined) row.planid = user.planid;
  if (user.planpk !== undefined) row.planpk = user.planpk;
  if (user.token !== undefined) row.token = user.token;
  if (user.auth !== undefined) row.auth = JSON.stringify(user.auth);
  if (user.github_access_token !== undefined) row.github_access_token = user.github_access_token;
  if (user.github_selected_repo !== undefined) {
    row.github_selected_repo = JSON.stringify(user.github_selected_repo);
  }
  if (user.otp !== undefined) row.otp = user.otp;
  if (user.isactive !== undefined) row.isactive = user.isactive ? 1 : 0;
  
  return row;
}