'use client';

import { Plus } from 'lucide-react';
import WorkflowNodeCard from './workflow-node-card';
import {
  type BuilderNode,
  type ExecutionState,
  type BuilderDefinition,
} from './builder-types';

interface TreeRendererProps {
  tree: BuilderDefinition;
  selectedNodeId: string | null;
  executionStates: Record<string, ExecutionState>;
  onSelectNode: (id: string) => void;
  onAddAfter: (parentId: string, afterNodeId: string | null, branch?: 'true' | 'false') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleDisable: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

export default function TreeRenderer({
  tree,
  selectedNodeId,
  executionStates,
  onSelectNode,
  onAddAfter,
  onDuplicate,
  onDelete,
  onToggleDisable,
  onToggleCollapse,
}: TreeRendererProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Trigger node */}
      <WorkflowNodeCard
        node={tree.trigger}
        isSelected={selectedNodeId === 'trigger'}
        executionState={executionStates['trigger']}
        onEdit={() => onSelectNode('trigger')}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onToggleDisable={() => {}}
        onToggleCollapse={() => {}}
      />

      {/* Connector + button after trigger */}
      <PlusButton onClick={() => onAddAfter('trigger', null)} />

      {/* Sequential children */}
      <SequenceRenderer
        nodes={tree.children}
        parentId="trigger"
        branch={undefined}
        selectedNodeId={selectedNodeId}
        executionStates={executionStates}
        onSelectNode={onSelectNode}
        onAddAfter={onAddAfter}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onToggleDisable={onToggleDisable}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  );
}

interface SequenceProps {
  nodes: BuilderNode[];
  parentId: string;
  branch?: 'true' | 'false';
  selectedNodeId: string | null;
  executionStates: Record<string, ExecutionState>;
  onSelectNode: (id: string) => void;
  onAddAfter: (parentId: string, afterNodeId: string | null, branch?: 'true' | 'false') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleDisable: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

function SequenceRenderer({
  nodes,
  parentId,
  branch,
  selectedNodeId,
  executionStates,
  onSelectNode,
  onAddAfter,
  onDuplicate,
  onDelete,
  onToggleDisable,
  onToggleCollapse,
}: SequenceProps) {
  if (nodes.length === 0) {
    // Empty branch — show a subtle "add first step" button
    return (
      <div className="flex w-full flex-col items-center py-2">
        <div className="h-6 w-px bg-white/[0.06]" />
        <button
          onClick={() => onAddAfter(parentId, null, branch)}
          className="group flex items-center gap-2 rounded-full border border-dashed border-white/[0.12] bg-[#182238] px-4 py-2 text-xs text-[#94A3B8] transition-all hover:border-[#5865F2]/60 hover:text-[#8EA0FF]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add first step
        </button>
      </div>
    );
  }

  return (
    <>
      {nodes.map((node, i) => (
        <div key={node.id} className="flex w-full flex-col items-center">
          {/* Node card */}
          <WorkflowNodeCard
            node={node}
            isSelected={selectedNodeId === node.id}
            executionState={executionStates[node.id]}
            onEdit={() => onSelectNode(node.id)}
            onDuplicate={() => onDuplicate(node.id)}
            onDelete={() => onDelete(node.id)}
            onToggleDisable={() => onToggleDisable(node.id)}
            onToggleCollapse={() => onToggleCollapse(node.id)}
          />

          {/* Branch rendering for if/else */}
          {node.actionType === 'if_else' && !node.collapsed && (
            <BranchRenderer
              node={node}
              selectedNodeId={selectedNodeId}
              executionStates={executionStates}
              onSelectNode={onSelectNode}
              onAddAfter={onAddAfter}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onToggleDisable={onToggleDisable}
              onToggleCollapse={onToggleCollapse}
            />
          )}

          {/* Connector + button after this node */}
          {i === nodes.length - 1 ? (
            <PlusButton onClick={() => onAddAfter(parentId, node.id, branch)} />
          ) : (
            <div className="h-6 w-px bg-white/[0.06]" />
          )}
        </div>
      ))}
    </>
  );
}

function BranchRenderer({
  node,
  selectedNodeId,
  executionStates,
  onSelectNode,
  onAddAfter,
  onDuplicate,
  onDelete,
  onToggleDisable,
  onToggleCollapse,
}: {
  node: BuilderNode;
  selectedNodeId: string | null;
  executionStates: Record<string, ExecutionState>;
  onSelectNode: (id: string) => void;
  onAddAfter: (parentId: string, afterNodeId: string | null, branch?: 'true' | 'false') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleDisable: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}) {
  return (
    <div className="relative mt-2 w-full">
      {/* Branch split connector */}
      <div className="flex justify-center">
        <div className="relative flex h-8 w-full max-w-[640px]">
          {/* Horizontal line */}
          <div className="absolute left-1/4 right-1/4 top-0 h-px bg-white/[0.06]" />
          {/* Left vertical */}
          <div className="absolute left-1/4 top-0 h-8 w-px -translate-x-1/2 bg-white/[0.06]" />
          {/* Right vertical */}
          <div className="absolute right-1/4 top-0 h-8 w-px translate-x-1/2 bg-white/[0.06]" />
        </div>
      </div>

      {/* Two branches */}
      <div className="grid grid-cols-2 gap-8">
        {/* TRUE branch */}
        <div className="flex flex-col items-center">
          <div className="mb-2 flex items-center gap-1.5 rounded-full border border-[#22C55E]/20 bg-[#22C55E]/8 px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#22C55E]">Yes</span>
          </div>
          <SequenceRenderer
            nodes={node.branches?.true || []}
            parentId={node.id}
            branch="true"
            selectedNodeId={selectedNodeId}
            executionStates={executionStates}
            onSelectNode={onSelectNode}
            onAddAfter={onAddAfter}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleDisable={onToggleDisable}
            onToggleCollapse={onToggleCollapse}
          />
        </div>

        {/* FALSE branch */}
        <div className="flex flex-col items-center">
          <div className="mb-2 flex items-center gap-1.5 rounded-full border border-[#EF4444]/20 bg-[#EF4444]/8 px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#EF4444]">No</span>
          </div>
          <SequenceRenderer
            nodes={node.branches?.false || []}
            parentId={node.id}
            branch="false"
            selectedNodeId={selectedNodeId}
            executionStates={executionStates}
            onSelectNode={onSelectNode}
            onAddAfter={onAddAfter}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleDisable={onToggleDisable}
            onToggleCollapse={onToggleCollapse}
          />
        </div>
      </div>

      {/* Merge connector */}
      <div className="flex justify-center">
        <div className="relative flex h-8 w-full max-w-[640px]">
          <div className="absolute left-1/4 right-1/4 bottom-0 h-px bg-white/[0.06]" />
          <div className="absolute left-1/4 bottom-0 h-8 w-px -translate-x-1/2 bg-white/[0.06]" />
          <div className="absolute right-1/4 bottom-0 h-8 w-px translate-x-1/2 bg-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}

function PlusButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="h-3 w-px bg-white/[0.06]" />
      <button
        onClick={onClick}
        className="group flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.10] bg-[#182238] text-[#94A3B8] shadow-lg transition-all hover:border-[#5865F2]/60 hover:bg-[#25304A] hover:text-[#8EA0FF]"
        aria-label="Add step"
      >
        <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
      </button>
      <div className="h-3 w-px bg-white/[0.06]" />
    </div>
  );
}
