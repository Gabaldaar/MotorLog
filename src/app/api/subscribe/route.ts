'use server';

import { NextResponse } from 'next/server';
import admin from '@/firebase/admin';

// Use the initialized admin instance. Do not initialize here.
const db = admin.firestore();

export async function POST(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
  }

  const idToken = authorization.split('Bearer ')[1];

  let decodedToken;
  try {
    // Verify the token using the Admin SDK
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error verifying token:', error);
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }
  
  const userId = decodedToken.uid;
  
  if (!userId) {
     return NextResponse.json({ error: 'Unauthorized: Could not verify user from token.' }, { status: 401 });
  }

  try {
    const subscription = await request.json();
    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }

    // Use the subscription endpoint as a unique ID for the document to prevent duplicates.
    const docId = encodeURIComponent(subscription.endpoint);
    const docRef = db.collection('subscriptions').doc(docId);
    
    await docRef.set({ 
        userId: userId,
        subscription: subscription,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving subscription:', error);
    return NextResponse.json({ error: 'Failed to save subscription', details: error.message }, { status: 500 });
  }
}
