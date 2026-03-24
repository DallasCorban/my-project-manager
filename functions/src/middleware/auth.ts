/**
 * Firebase Auth middleware — verifies the ID token from the Authorization header
 * and attaches the decoded user to the request.
 */
import * as admin from "firebase-admin";
import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";

export interface AuthenticatedRequest extends Request {
  user: admin.auth.DecodedIdToken;
}

/**
 * Verify the Firebase Auth ID token from the Authorization header.
 * Returns the decoded token or sends a 401 and returns null.
 */
export async function verifyAuth(
  req: Request,
  res: Response
): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return null;
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
}
