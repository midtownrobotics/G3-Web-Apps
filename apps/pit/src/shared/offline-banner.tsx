import { useIsOnline } from "@g3/ui"

export function OfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) return;
  
  return (
    <div className="text-center py-2 text-md bg-gray-500">
      You are in offline mode.
    </div>
  )
}