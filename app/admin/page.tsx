'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import AuthScreen from '@/components/AuthScreen';

const ACCENT = '#3B5BDB';
const BG = '#F6F5F2';
const BORDER = '#E4E1D8';
const INK = '#1C1C1E';
const MUTED = '#6B7280';

export default function AdminPage() {
  return (
    <>
      <AuthLoading>
        <div style={{ background: BG, color: MUTED }} className="min-h-screen flex items-center justify-center text-sm">Loading…</div>
      </AuthLoading>
      <Unauthenticated>
        <AuthScreen />
      </Unauthenticated>
      <Authenticated>
        <AdminContent />
      </Authenticated>
    </>
  );
}

function AdminContent() {
  const me = useQuery(api.users.me);
  const users = useQuery(api.admin.listUsers);
  const deleteUser = useMutation(api.admin.deleteUser);
  const [selected, setSelected] = useState<Id<'users'> | null>(null);
  const detail = useQuery(api.admin.getUserDetail, selected === null ? 'skip' : { userId: selected });

  if (me === undefined || users === undefined) {
    return <div style={{ background: BG, color: MUTED }} className="min-h-screen flex items-center justify-center text-sm">Loading…</div>;
  }
  if (me === null) return null;
  if (me.role !== 'admin') {
    return (
      <div style={{ background: BG, color: INK }} className="min-h-screen flex items-center justify-center">
        <div className="rounded-2xl border p-6 text-sm" style={{ background: 'white', borderColor: BORDER }}>
          Access denied — admin only.
        </div>
      </div>
    );
  }

  async function handleDelete(userId: Id<'users'>) {
    if (!window.confirm('Delete this user and ALL their data? This cannot be undone.')) return;
    if (selected === userId) setSelected(null);
    await deleteUser({ userId });
  }

  return (
    <div style={{ background: BG, color: INK, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }} className="min-h-screen w-full">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Shiftlog Admin</h1>
            <p className="text-xs" style={{ color: MUTED }}>User management</p>
          </div>
          <a href="/" className="text-sm font-medium underline" style={{ color: ACCENT }}>Back to app</a>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: BORDER, background: 'white' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: MUTED }} className="text-left">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: MUTED }}>No users yet.</td></tr>}
              {users.map((u) => (
                <tr key={u._id} className="border-t" style={{ borderColor: BORDER, background: selected === u._id ? '#EFF3FC' : 'white' }}>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 text-xs">
                    <span
                      className="px-2 py-0.5 rounded-full font-medium"
                      style={{ background: u.role === 'admin' ? '#EFF3FC' : '#EAF5EE', color: u.role === 'admin' ? ACCENT : '#2F7D4F' }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: MUTED }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setSelected(u._id === selected ? null : u._id)} className="text-xs font-medium underline mr-3" style={{ color: ACCENT }}>
                      {selected === u._id ? 'Hide' : 'View'}
                    </button>
                    {u.role !== 'admin' && (
                      <button onClick={() => handleDelete(u._id)} className="text-xs font-medium underline" style={{ color: '#B5342F' }}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {detail && (
          <div className="mt-5 rounded-xl border" style={{ borderColor: BORDER, background: 'white' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: BORDER }}>
              <h2 className="font-semibold text-sm">{detail.user.email}</h2>
              <p className="text-xs" style={{ color: MUTED }}>
                {detail.sessions.length} sessions · {detail.totals.hours.toFixed(2)}h total · {detail.totals.paidHours.toFixed(2)}h paid · {detail.totals.pay.toFixed(2)} pay
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {detail.sessions.length === 0 && <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>No sessions.</p>}
              {detail.sessions.map((s) => (
                <div key={s._id} className="flex items-center justify-between px-4 py-2 border-t text-sm" style={{ borderColor: BORDER }}>
                  <div>
                    <div className="text-xs font-mono" style={{ color: MUTED }}>
                      {new Date(s.startISO).toLocaleString()} – {new Date(s.endISO).toLocaleTimeString()}
                    </div>
                    <div className="break-words">{s.note}</div>
                  </div>
                  <div className="text-xs font-mono flex-shrink-0" style={{ color: MUTED }}>
                    {((new Date(s.endISO).getTime() - new Date(s.startISO).getTime()) / 3600000).toFixed(2)}h
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
