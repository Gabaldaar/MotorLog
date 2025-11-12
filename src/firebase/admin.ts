import admin from 'firebase-admin';

// This file is structured to prevent any re-initialization of the Firebase Admin SDK.
// It ensures that `admin.initializeApp` is called only once in the server's lifecycle.

let serviceAccount;

// Check if the service account key is available in the environment variables.
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    // Attempt to parse the service account key from a JSON string.
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } catch (e) {
    // If parsing fails, it might be because the variable is not a JSON string.
    // Log the error for debugging but proceed, as initialization will fail later
    // with a clearer message if the service account is truly invalid.
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', e);
  }
}

// Initialize the app only if it hasn't been initialized yet.
// `admin.apps.length` is the standard way to check for existing initializations.
if (!admin.apps.length) {
  if (!serviceAccount) {
    // This runtime error will be thrown if the server starts without the necessary
    // environment variable, preventing silent failures.
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY is missing or invalid. The application will not be able to connect to Firebase services on the backend.');
  } else {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

// Export the initialized admin instance.
// If initialization failed, any attempt to use this export will result in errors,
// making the problem visible.
export default admin;
