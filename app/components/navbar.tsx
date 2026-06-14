import { Link } from "react-router";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/60">
      <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4">
        <div className="flex flex-1 items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/">
              <h1 className="text-lg font-semibold cursor-pointer hover:text-gray-600 transition-colors">
                Test-Title
              </h1>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
