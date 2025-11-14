
"use client";

import { useEffect } from "react";

const PwaSetup = () => {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Register the service worker immediately, don't wait for 'load'
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => console.log("Service Worker registrado con éxito:", registration))
        .catch((error) => console.log("Error en el registro del Service Worker:", error));
    }
  }, []);

  return null;
};

export default PwaSetup;
