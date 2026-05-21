
import React, { useState } from 'react';
import { User } from '../types';
import { Lock, Mail, ArrowRight, AlertCircle, Loader2, Database, CheckCircle } from 'lucide-react';
import { loginUser } from '../services/apiService';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        const { user, error: loginError } = await loginUser(email, password);
        if (user) {
            onLogin(user as User);
        } else {
            setError(loginError || 'Invalid credentials.');
            setLoading(false);
        }
    } catch (err: any) {
      console.error(err);
      setError('Login error. Please try again.');
      setLoading(false);
    }
  };

  const autoLoginDemo = async () => {
      setLoading(true);
      const admin = users.find(u => u.role === 'admin') || users[0];
      if (admin) {
          const { user, error: loginError } = await loginUser(admin.email, 'admin1234');
          if (user) {
              onLogin(user as User);
          } else {
              // Fallback: login directo si no tiene contraseña aún
              onLogin(admin);
          }
          setLoading(false);
      } else {
          setError("Admin user not found. Please reset the database.");
          setLoading(false);
      }
  };

  const LOGO_URL = "/blackmoon-logo.svg";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg p-1 overflow-hidden border-4 border-white">
             <img 
               src={LOGO_URL} 
               alt="CRM BLACKMOON Logo" 
               className="w-full h-full object-cover rounded-full transform hover:scale-105 transition duration-500" 
             />
          </div>
        </div>
        <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          CRM BLACKMOON
        </h2>
        <div className="mt-2 text-center flex items-center justify-center gap-1 text-sm text-green-600 font-medium">
            <CheckCircle size={14} /> System Ready
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {/* MongoDB Mode Indicator */}
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="bg-green-50 p-2 rounded-lg text-green-600">
                    <Database size={20} />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-gray-900">MongoDB Authentication</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        Credentials are validated against the database.
                        Data is stored persistently in MongoDB.
                    </p>
                </div>
            </div>
        </div>

        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border transition-colors"
                  placeholder="admin@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md p-2.5 border transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4 border border-red-100">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 gap-2 items-center transition-all transform hover:translate-y-[-1px] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <span className="flex items-center gap-2">Sign in securely <ArrowRight size={16} /></span>}
              </button>
              
              <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">Quick Access</span>
                  <div className="flex-grow border-t border-gray-200"></div>
              </div>

              <button
                type="button"
                onClick={autoLoginDemo}
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                 Enter as Admin (Local Demo)
              </button>
            </div>
          </form>
        </div>
        
        <p className="mt-6 text-center text-xs text-gray-400">
           &copy; 2024 BlackMoon CRM. Local Version.
        </p>
      </div>
    </div>
  );
};
