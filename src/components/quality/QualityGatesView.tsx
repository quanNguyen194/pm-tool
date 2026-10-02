import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { QualityCheckItem, QualityGatePhase } from '../../types';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  FileCheck,
  UserCheck,
  Calendar,
  Lock,
  Unlock,
  X,
  MessageSquare
} from 'lucide-react';

export const QualityGatesView: React.FC = () => {
  const {
    activeProject,
    projectQualityGates,
    toggleQualityItemPassed,
    updateQualityNotes,
    addQualityItem,
    canApproveQuality,
    currentUser
  } = useApp();

  const phases = projectQualityGates?.phases || [];
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(activeProject.currentPhase || 'phase_1');
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [selectedItemForNotes, setSelectedItemForNotes] = useState<{ phaseId: string; item: QualityCheckItem } | null>(null);
  const [noteText, setNoteText] = useState('');

  // New item form state
  const [newItemData, setNewItemData] = useState({
    title: '',
    description: '',
    isMandatory: true,
    notes: ''
  });

  const selectedPhase = phases.find(p => p.id === selectedPhaseId) || phases[0];

  const handleOpenNotes = (phaseId: string, item: QualityCheckItem) => {
    setSelectedItemForNotes({ phaseId, item });
    setNoteText(item.notes || '');
    setIsNotesModalOpen(true);
  };

  const handleSaveNotes = () => {
    if (!selectedItemForNotes) return;
    updateQualityNotes(selectedItemForNotes.item.id, noteText);
    setIsNotesModalOpen(false);
  };

  const handleAddItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemData.title.trim()) return;
    addQualityItem(selectedPhase.id, {
      title: newItemData.title,
      description: newItemData.description,
      isMandatory: newItemData.isMandatory,
      notes: newItemData.notes || undefined
    });
    setIsAddItemModalOpen(false);
    setNewItemData({
      title: '',
      description: '',
      isMandatory: true,
      notes: ''
    });
  };

  // Phase compliance metrics
  const totalPhaseItems = selectedPhase?.items.length || 0;
  const passedPhaseItems = selectedPhase?.items.filter(i => i.isPassed).length || 0;
  const mandatoryItems = selectedPhase?.items.filter(i => i.isMandatory) || [];
  const mandatoryPassed = mandatoryItems.filter(i => i.isPassed).length;
  const isPhaseGatePassed = mandatoryItems.length > 0 && mandatoryPassed === mandatoryItems.length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Tiêu Chuẩn Đầu Ra Quality Gates & Definition of Done
            </h1>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded break-all min-w-0">
              [{activeProject.code}]
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kiểm soát chất lượng nghiêm ngặt theo 5 giai đoạn phát triển phần mềm chuẩn CMMI & Agile DoD
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canApproveQuality && (
            <button
              onClick={() => setIsAddItemModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm Tiêu Chuẩn Vào Gate Này</span>
            </button>
          )}
        </div>
      </div>

      {/* 5 Stages Horizontal Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 border-b border-slate-200 pb-3">
        {phases.map((phase, idx) => {
          const isSelected = phase.id === selectedPhaseId;
          const total = phase.items.length;
          const passed = phase.items.filter(i => i.isPassed).length;
          const mandatoryTotal = phase.items.filter(i => i.isMandatory).length;
          const mandatoryPassCount = phase.items.filter(i => i.isMandatory && i.isPassed).length;
          const isReady = mandatoryTotal > 0 && mandatoryPassCount === mandatoryTotal;

          return (
            <button
              key={phase.id}
              onClick={() => setSelectedPhaseId(phase.id)}
              className={`text-left p-3 rounded-2xl border transition-all ${
                isSelected
                  ? 'theme-fixed bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className={isSelected ? 'text-indigo-300 dark:text-indigo-100' : 'text-slate-500'}>
                  GATE 0{idx + 1}
                </span>
                {isReady ? (
                  <span className={`font-bold ${isSelected ? "text-emerald-300 dark:text-emerald-200" : "text-emerald-700"}`}>✓ ĐẠT</span>
                ) : (
                  <span className={isSelected ? 'text-amber-300 dark:text-amber-200' : 'text-amber-700'}>○ CHƯA ĐỦ</span>
                )}
              </div>
              <div className="font-bold text-xs truncate">{phase.shortName}</div>
              <div className={`text-[10px] mt-1 font-mono tabular-nums ${isSelected ? 'text-slate-300 dark:text-indigo-100' : 'text-slate-500'}`}>
                {passed}/{total} tiêu chí ({total > 0 ? Math.round((passed / total) * 100) : 0}%)
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Phase Information Card */}
      {selectedPhase && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="text-xs font-mono font-semibold text-indigo-600 mb-0.5">
                TIÊU CHUẨN KIỂM SOÁT ĐẦU RA (QUALITY GATEWAY)
              </div>
              <h2 className="text-lg font-bold text-slate-900">{selectedPhase.name}</h2>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">{selectedPhase.description}</p>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200/80 shrink-0">
              <div>
                <div className="text-[11px] text-slate-500">Tỷ Lệ Đạt Tiêu Chuẩn</div>
                <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  {passedPhaseItems}/{totalPhaseItems}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Bắt buộc: {mandatoryPassed}/{mandatoryItems.length}
                </div>
              </div>

              <div className="w-14 h-14 rounded-full border-4 border-slate-200 border-t-indigo-600 flex items-center justify-center font-mono font-bold text-xs text-slate-800 bg-white">
                {totalPhaseItems > 0 ? Math.round((passedPhaseItems / totalPhaseItems) * 100) : 0}%
              </div>
            </div>
          </div>

          {/* Gate Transition Readiness Alert Banner */}
          <div className="mt-4">
            {isPhaseGatePassed ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <div>
                  <strong>Đủ Điều Kiện Thông Qua (Gate Passed):</strong> Toàn bộ {mandatoryItems.length} tiêu chuẩn bắt buộc của giai đoạn này đã được thẩm định đạt chuẩn. Dự án đủ điều kiện tiến sang giai đoạn tiếp theo.
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <strong>Chưa Đủ Điều Kiện Thông Qua (Gate Blocked):</strong> Còn {mandatoryItems.length - mandatoryPassed} tiêu chí bắt buộc chưa đạt. Cần hoàn thành thẩm định trước khi ký duyệt bàn giao giai đoạn tiếp theo.
                </div>
              </div>
            )}
          </div>

          {/* Checklist Items Table / List */}
          <div className="mt-5 space-y-3">
            {selectedPhase.items.map(item => {
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    item.isPassed
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Checkbox trigger */}
                      <button
                        disabled={!canApproveQuality}
                        onClick={() => toggleQualityItemPassed(selectedPhase.id, item.id)}
                        className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0 ${
                          item.isPassed
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'border-2 border-slate-300 hover:border-indigo-500 bg-white'
                        } ${!canApproveQuality ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={
                          !canApproveQuality
                            ? 'Chỉ Quản trị viên, PM hoặc QA mới có quyền thẩm định tiêu chuẩn'
                            : item.isPassed ? 'Bấm để hủy xác nhận' : 'Bấm để xác nhận đạt chuẩn'
                        }
                      >
                        {item.isPassed && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className={`text-xs font-bold ${item.isPassed ? 'text-emerald-950 line-through' : 'text-slate-900'}`}>
                            {item.title}
                          </h4>
                          {item.isMandatory ? (
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                              BẮT BUỘC
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                              Khuyến nghị
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                              item.isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.isPassed ? '✓ ĐÃ ĐẠT' : '○ CHƯA ĐẠT'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed mb-2">
                          {item.description}
                        </p>

                        {/* Audit information */}
                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                          {item.checkedBy && (
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-emerald-700" />
                              <span>Thẩm định: <strong>{item.checkedBy}</strong></span>
                            </span>
                          )}
                          {item.checkedAt && (
                            <span className="flex items-center gap-1 font-mono">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{item.checkedAt}</span>
                            </span>
                          )}
                          {item.notes && (
                            <span className="text-indigo-600 italic">
                              Ghi chú: "{item.notes}"
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleOpenNotes(selectedPhase.id, item)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 text-[11px] flex items-center gap-1"
                        title="Thêm hoặc sửa ghi chú kiểm thử"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span className="hidden sm:inline">Ghi chú</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add New Quality Item Modal */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Thêm Tiêu Chuẩn Chất Lượng (DoD Criteria)
              </h3>
              <button onClick={() => setIsAddItemModalOpen(false)} className="p-1 text-slate-500 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddItemSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giai Đoạn Áp Dụng</label>
                <div className="px-3 py-2 text-xs bg-slate-100 rounded-lg font-semibold text-slate-800">
                  {selectedPhase.name}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên Tiêu Chuẩn Chất Lượng</label>
                <input
                  type="text"
                  required
                  value={newItemData.title}
                  onChange={e => setNewItemData({ ...newItemData, title: e.target.value })}
                  placeholder="VD: Kiểm tra bảo mật chống SQL Injection và XSS..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mô Tả & Phương Pháp Kiểm Tra</label>
                <textarea
                  rows={2}
                  value={newItemData.description}
                  onChange={e => setNewItemData({ ...newItemData, description: e.target.value })}
                  placeholder="Tiêu chí đánh giá, công cụ kiểm thử hoặc tài liệu cần cung cấp..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isMandatoryCheck"
                  checked={newItemData.isMandatory}
                  onChange={e => setNewItemData({ ...newItemData, isMandatory: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <label htmlFor="isMandatoryCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Tiêu chí bắt buộc (Gate Blocker - Nếu không đạt sẽ không thể chuyển giao giai đoạn)
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi Chú Ban Đầu</label>
                <input
                  type="text"
                  value={newItemData.notes}
                  onChange={e => setNewItemData({ ...newItemData, notes: e.target.value })}
                  placeholder="Ghi chú người phụ trách hoặc tài liệu tham chiếu..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Thêm Tiêu Chuẩn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notes / Audit Modal */}
      {isNotesModalOpen && selectedItemForNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h3 className="text-sm font-bold text-slate-900">Ghi Chú Thẩm Định Chất Lượng</h3>
              <button onClick={() => setIsNotesModalOpen(false)} className="p-1 text-slate-500 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 font-semibold mb-2">
              {selectedItemForNotes.item.title}
            </div>

            <textarea
              rows={4}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Nhập nhận xét kiểm thử, bằng chứng đánh giá hoặc lý do chưa đạt..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg mb-4"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNotesModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 rounded-lg"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Lưu Ghi Chú
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
