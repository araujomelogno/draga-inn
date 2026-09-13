'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendSignInLinkToEmail, browserLocalPersistence, setPersistence,
  type User,
} from 'firebase/auth';

let app: FirebaseApp | undefined;

function firebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  });
  return app;
}

export function auth() {
  const a = getAuth(firebaseApp());
  // La sesión persiste en el dispositivo: el encargado no inicia sesión cada día.
  void setPersistence(a, browserLocalPersistence);
  return a;
}

/** Token fresco para cada request. Firebase lo renueva solo. */
export async function getIdToken(): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export function watchUser(fn: (u: User | null) => void): () => void {
  return onAuthStateChanged(auth(), fn);
}

export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth(), email, password);
}

export async function sendMagicLink(email: string, redirectUrl: string): Promise<void> {
  await sendSignInLinkToEmail(auth(), email, { url: redirectUrl, handleCodeInApp: true });
  window.localStorage.setItem('draga:email', email);
}

export async function logout(): Promise<void> {
  await signOut(auth());
}
