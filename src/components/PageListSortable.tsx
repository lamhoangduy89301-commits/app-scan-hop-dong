'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCw, Crop, Trash2, Camera, Plus, Image as ImageIcon } from 'lucide-react';
import { ScannedPage } from '@/types';

interface PageListSortableProps {
  pages: ScannedPage[];
  onReorder: (newPages: ScannedPage[]) => void;
  onRotatePage: (pageId: string) => void;
  onEditPage: (page: ScannedPage) => void;
  onDeletePage: (pageId: string) => void;
  onOpenAddCamera: () => void;
  onAddFromGallery: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Individual Sortable Card Component
const SortablePageCard: React.FC<{
  page: ScannedPage;
  index: number;
  onRotate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ page, index, onRotate, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : 'auto',
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-slate-800/90 rounded-2xl overflow-hidden border border-slate-700/80 shadow-md flex flex-col justify-between"
    >
      {/* Top Header Badge & Drag Handle */}
      <div className="p-2.5 flex items-center justify-between bg-slate-900/60 backdrop-blur-xs border-b border-slate-700/50">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full bg-blue-600 text-[11px] font-bold text-white flex items-center justify-center shadow-sm">
            {index + 1}
          </span>
          <span className="text-xs font-semibold text-slate-300">Trang {index + 1}</span>
        </div>

        {/* Drag handle button with dnd-kit listeners */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-grab active:cursor-grabbing transition"
          aria-label="Kéo đổi thứ tự trang"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Page Image Preview */}
      <div
        onClick={onEdit}
        className="relative aspect-[3/4] w-full bg-slate-950 flex items-center justify-center p-2 cursor-pointer group-hover:opacity-95 transition"
      >
        <img
          src={page.thumbnailUrl || page.processedDataUrl}
          alt={`Trang ${index + 1}`}
          className="max-h-full max-w-full object-contain rounded shadow-sm select-none pointer-events-none"
        />

        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
          <span className="px-2.5 py-1 bg-slate-900/90 text-white text-[11px] font-semibold rounded-lg border border-slate-700 flex items-center gap-1">
            <Crop className="w-3.5 h-3.5 text-blue-400" />
            <span>Chỉnh sửa</span>
          </span>
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="p-2 bg-slate-900/90 border-t border-slate-700/60 flex items-center justify-around gap-1">
        <button
          onClick={onRotate}
          title="Xoay 90°"
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-90"
        >
          <RotateCw className="w-4 h-4 text-amber-400" />
        </button>

        <button
          onClick={onEdit}
          title="Cắt góc & Bộ lọc"
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-90"
        >
          <Crop className="w-4 h-4 text-blue-400" />
        </button>

        <button
          onClick={onDelete}
          title="Xoá trang"
          className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-90"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const PageListSortable: React.FC<PageListSortableProps> = ({
  pages,
  onReorder,
  onRotatePage,
  onEditPage,
  onDeletePage,
  onOpenAddCamera,
  onAddFromGallery,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Configure touch and pointer sensors with delay/distance constraints
  // so vertical scrolling on mobile does not trigger accidental drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before starting reorder
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over.id);
      onReorder(arrayMove(pages, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden File Input for Add Photos */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={onAddFromGallery}
        className="hidden"
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {pages.map((page, idx) => (
              <SortablePageCard
                key={page.id}
                page={page}
                index={idx}
                onRotate={() => onRotatePage(page.id)}
                onEdit={() => onEditPage(page)}
                onDelete={() => onDeletePage(page.id)}
              />
            ))}

            {/* Quick Add More Pages Card */}
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500/80 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 text-center min-h-[200px] bg-slate-900/40 transition group">
              <span className="text-xs font-semibold text-slate-400 group-hover:text-blue-400 transition">
                Thêm trang hợp đồng
              </span>
              <div className="flex flex-col w-full gap-2">
                <button
                  onClick={onOpenAddCamera}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Chụp thêm</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 border border-slate-700"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Chọn ảnh</span>
                </button>
              </div>
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
