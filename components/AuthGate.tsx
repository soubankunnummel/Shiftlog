'use client';

import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react';
import AuthScreen from './AuthScreen';
import ShiftlogApp from './ShiftlogApp';

export default function AuthGate() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: '#6B7280' }}>
          Loading Shiftlog…
        </div>
      </AuthLoading>
      <Unauthenticated>
        <AuthScreen />
      </Unauthenticated>
      <Authenticated>
        <ShiftlogApp />
      </Authenticated>
    </>
  );
}
