import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaChartLine,
  FaGithub,
  FaHardHat,
  FaInstagram,
  FaSlack,
  FaToolbox,
  FaTrophy,
  FaUserShield,
} from "react-icons/fa";
import { LuGitBranch } from "react-icons/lu";
import { g3id } from "../../lib/api";

type App = {
  label: string;
  href: string;
  icon: IconType;
  bg: string;
  external?: boolean;
};

const APPS: App[] = [
  {
    label: "G3ID",
    href: "https://g3id.g3robotics.com",
    icon: FaUserShield,
    bg: "bg-red-600",
  },
  {
    label: "Shop",
    href: "https://shop.g3robotics.com",
    icon: FaToolbox,
    bg: "bg-orange-600",
  },
  {
    label: "Pit",
    href: "https://pit.g3robotics.com",
    icon: FaHardHat,
    bg: "bg-yellow-600",
  },
  {
    label: "Skill Tree",
    href: "https://skilltree.g3robotics.com",
    icon: LuGitBranch,
    bg: "bg-amber-900",
  },
  {
    label: "Slack",
    href: "https://g3robotics.slack.com",
    icon: FaSlack,
    bg: "bg-purple-600",
    external: true,
  },
  {
    label: "The Blue Alliance",
    href: "https://www.thebluealliance.com/team/1648",
    icon: FaTrophy,
    bg: "bg-blue-600",
    external: true,
  },
  {
    label: "Statbotics",
    href: "https://www.statbotics.io/team/1648",
    icon: FaChartLine,
    bg: "bg-gray-400",
    external: true,
  },
  {
    label: "GitHub",
    href: "https://github.com/midtownrobotics",
    icon: FaGithub,
    bg: "bg-gray-700",
    external: true,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/g3robotics1648/",
    icon: FaInstagram,
    bg: "bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600",
    external: true,
  },
];

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function HomePage() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    g3id.auth.me.$get().then(async (res) => {
      if (res.ok) {
        setAuthState("authenticated");
      } else {
        setAuthState("unauthenticated");
      }
    });
  }, []);

  if (authState === "checking") {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="animate-pulse">
            <p className="text-red-600 font-semibold text-lg tracking-widest uppercase">
              Loading...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div>
            <p className="text-red-600 font-semibold text-lg tracking-widest uppercase mb-2">
              FRC Team 1648
            </p>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">G3 Robotics</h1>
            <p className="text-gray-600">FIRST Robotics Competition</p>
          </div>

          <div className="space-y-3 pt-6">
            <a
              href={`https://g3id.g3robotics.com/login?redirect=${encodeURIComponent(window.location.href)}`}
              className="block w-full px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
            >
              Sign In
            </a>
            <a
              href="https://g3robotics.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-6 py-3 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold transition-colors"
            >
              Not a member? Visit public site
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="mb-10">
          <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-1">
            Team 1648
          </p>
          <h1 className="text-4xl font-bold text-gray-900">Member Apps</h1>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-4 gap-y-8">
          {APPS.map((app) => {
            return (
              <a
                key={app.label}
                href={app.href}
                target={app.external ? "_blank" : undefined}
                rel={app.external ? "noopener noreferrer" : undefined}
                className="flex flex-col items-center gap-2 group"
              >
                <div
                  className={`w-16 h-16 rounded-2xl ${app.bg} flex items-center justify-center shadow-lg transition-transform duration-150 group-hover:scale-110`}
                >
                  <span className="text-white text-3xl">
                    <app.icon />
                  </span>
                </div>
                <span className="text-xs text-center leading-tight transition-colors text-gray-600 group-hover:text-gray-900">
                  {app.label}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}
