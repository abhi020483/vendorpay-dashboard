import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff } from "lucide-react";

const PASS = "onealpha";

function AlphaMedLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="alphaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="50%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      {/* Alpha circle */}
      <circle cx="50" cy="50" r="42" stroke="url(#alphaGrad)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="220 45" transform="rotate(-30 50 50)" />
      {/* Inner dot */}
      <circle cx="50" cy="50" r="6" fill="url(#alphaGrad)" />
      {/* Arrow accent */}
      <polygon points="88,45 98,50 88,55" fill="url(#alphaGrad)" />
      {/* Text */}
      <text x="110" y="62" fontFamily="General Sans, Inter, sans-serif" fontSize="46" fontWeight="700" fill="#4B5563">Alpha</text>
      <text x="270" y="62" fontFamily="General Sans, Inter, sans-serif" fontSize="46" fontWeight="700" fill="#4B5563">Med</text>
      {/* Small arrow after text */}
      <polygon points="375,45 385,50 375,55" fill="url(#alphaGrad)" />
    </svg>
  );
}

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    setTimeout(() => {
      if (password === PASS) {
        sessionStorage.setItem("vendorpay_auth", "1");
        onLogin();
      } else {
        setError("Invalid password. Please try again.");
      }
      setLoading(false);
    }, 500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="w-full max-w-md px-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <AlphaMedLogo className="h-16 w-auto" />
          </div>

          {/* Subtitle */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-gray-800">VendorPay Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Enter password to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type={showPass ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                className="pl-10 pr-10 h-11 text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-sm font-medium"
              disabled={loading || !password}
            >
              {loading ? "Verifying..." : "Sign In"}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-[11px] text-gray-400 mt-8">
            OneAlphaMed Private Limited
          </p>
        </div>
      </div>
    </div>
  );
}
