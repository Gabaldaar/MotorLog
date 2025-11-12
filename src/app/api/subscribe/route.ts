import { NextResponse } from 'next/server';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

if (!getApps().length) {
  if (!serviceAccount) {
    console.log('FIREBASE_SERVICE_ACCOUNT_KEY not found, using default credentials');
    initializeApp();
  } else {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

const db = getFirestore();

export async function POST(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
  }

  const idToken = authorization.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error verifying token:', error);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }

  const userId = decodedToken.uid;
  if (!userId) {
     return NextResponse.json({ error: 'Unauthorized: Could not verify user.' }, { status: 401 });
  }

  try {
    const subscription = await request.json();
    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }

    const docRef = doc(db, 'subscriptions', subscription.endpoint);
    await setDoc(docRef, { 
        userId: userId,
        subscription: subscription,
        createdAt: serverTimestamp() 
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving subscription:', error);
    return NextResponse.json({ error: 'Failed to save subscription', details: error.message }, { status: 500 });
  }
}
