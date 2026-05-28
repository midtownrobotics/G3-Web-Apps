import { useSearchParams } from "react-router-dom";

export function RedirectInfo() {
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const domain = redirect ? new URL(redirect).host : "";

  if (!redirect) return null;

  return (
    <div className="bg-gray-500 text-white px-6 py-1 text-center">
      <span>
        After login, you will be redirected to{" "}
        <a className="text-blue-300 underline" href={redirect}>
          {domain}
        </a>
        .
      </span>
    </div>
  );
}
