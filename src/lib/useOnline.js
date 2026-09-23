import { useSyncExternalStore } from "react";

function current() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function useOnline() {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    current,
    current
  );
}
