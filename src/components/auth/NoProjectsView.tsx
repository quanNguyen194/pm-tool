import React, { useState } from 'react';
import { Database, FolderPlus, LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Hiển thị khi tài khoản chưa thuộc dự án nào (hoặc hệ thống chưa có dự án). */
export const NoProjectsView: React.FC = () => {
  const { currentUser, isAdmin, createProject, seedDemoData, signOut } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    createProject({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: '',
      status: 'planning',
      priority: 'medium',
      managerId: currentUser.id,
      startDate: start,
      targetEndDate: end,
      budget: 0,
      currentPhase: 'phase_1',
      progressModel: 'criteria',
      memberIds: []
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">Chưa có dự án nào</h1>
            <p className="text-xs text-slate-500 mt-1">
              Xin chào <strong className="text-slate-700">{currentUser.name}</strong>.
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>

        {!isAdmin ? (
          <p className="text-sm text-slate-600 mt-5 leading-relaxed">
            Bạn chưa được thêm vào dự án nào. Hãy nhờ quản trị viên hoặc PM thêm bạn bằng email{' '}
            <strong className="text-slate-800">{currentUser.email}</strong>, sau đó tải lại trang.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-slate-600">
              Bạn là quản trị viên. Tạo dự án đầu tiên hoặc nạp bộ dữ liệu demo để xem thử.
            </p>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mã</label>
                  <input
                    required
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="CORE-BANK"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:outline-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tên dự án</label>
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bắt đầu</label>
                  <input
                    type="date"
                    required
                    value={start}
                    onChange={e => setStart(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hạn chót</label>
                  <input
                    type="date"
                    required
                    value={end}
                    onChange={e => setEnd(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Tạo dự án</span>
              </button>
            </form>

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <div className="flex-1 border-t border-slate-200" />
              <span>hoặc</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <button
              onClick={seedDemoData}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <Database className="w-4 h-4" />
              <span>Nạp 3 dự án demo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
