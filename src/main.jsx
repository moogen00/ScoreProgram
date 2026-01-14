import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { GoogleOAuthProvider } from '@react-oauth/google'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {CLIENT_ID ? (
            <GoogleOAuthProvider clientId={CLIENT_ID}>
                <App />
            </GoogleOAuthProvider>
        ) : (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="glass-card p-8 text-center border border-rose-500/30">
                    <h1 className="text-xl font-bold text-rose-400 mb-2">Configuration Error</h1>
                    <p className="text-slate-400 text-sm">VITE_GOOGLE_CLIENT_ID is missing in .env file</p>
                </div>
            </div>
        )}
    </React.StrictMode>,
)
