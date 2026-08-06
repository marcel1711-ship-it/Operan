'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft, Save, Play, Loader2, AlertCircle, CheckCircle2,
  ShieldAlert, FlaskConical, History, ZoomIn, ZoomOut, Maximize,
  Plus, Zap, GitBranch, Clock, Layers, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  validateNodeConfig,
  getDefaultConfig,
} from '@/lib/communications/node-config';

import {
  type Workflow,
  type Version,
  type BuilderNode,
  type BuilderDefinition,
  type ExecutionState,
  TRIGGER_OPTIONS,
  ACTION_CATEGORIES,
  getActionDef,
  flatToTree,
  treeToFlat,
  generateNodeId,
  getSummary,
  countActions,
  countConditions,
  estimateExecutionTime,
  getActiveIntegrations,
} from '@/components/automations/builder-types';
import ActionPicker from '@/components/automations/action-picker';
import TreeRenderer from '@/components/automations/tree-renderer';
import ConfigPanel from '@/components/automations/config-panel';

const NONE_VALUE = '__none__';

function regenBranchIds(nodes: BuilderNode[]): BuilderNode[] {
  return nodes.map((n) => {
    const newNode = { ...n, id: generateNodeId() };
    if (n.branches) {
      newNode.branches = { true: regenBranchIds(n.branches.true), false: regenBranchIds(n.branches.false) };
    }
    return newNode;
  });
}

export default function WorkflowBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [providerWarnings, setProviderWarnings] = useState<string[]>([]);
  const [nodeConfigErrors, setNodeConfigErrors] = useState<string[]>([]);

  const [tree, setTree] = useState<BuilderDefinition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerContext, setPickerContext] = useState<{
    parentId: string;
    afterNodeId: string | null;
    branch?: 'true' | 'false';
  } | null>(null);
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const [favoriteActions, setFavoriteActions] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [executionStates, setExecutionStates] = useState<Record<string, ExecutionState>>({});

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [templates, setTemplates] = useState<{ id: string; name: string; channel: string }[]>([]);
  const [listings, setListings] = useState<{ id: string; name: string }[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; pipeline_id: string }[]>([]);
  const [integrations, setIntegrations] = useState<{ id: string; category: string; provider: string; connection_status: string; enabled: boolean }[]>([]);

  // ============================================================
  // Load
  // ============================================================
  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    const { data: wf } = await supabase
      .from('automation_workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!wf) { router.push('/automations'); return; }
    setWorkflow(wf as Workflow);

    const { data: vers } = await supabase
      .from('automation_workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('version_number', { ascending: false });

    if (vers) setVersions(vers as Version[]);

    if (vers && vers.length > 0) {
      const latestDraft = vers.find((v: any) => v.published_at === null);
      const latest = latestDraft || vers[0];
      if (latest.definition?.nodes?.length > 0) {
        const built = flatToTree(latest.definition.nodes, latest.definition.edges, wf.trigger_type);
        setTree(built);
      } else {
        initTree(wf.trigger_type);
      }
    } else {
      initTree(wf.trigger_type);
    }

    const [tmplRes, listRes, pipeRes, stageRes] = await Promise.all([
      supabase.from('communication_templates').select('id, name, channel').eq('tenant_id', tenantId).eq('is_active', true).is('archived_at', null).order('name'),
      supabase.from('listings').select('id, name').eq('tenant_id', tenantId).order('name'),
      supabase.from('pipelines').select('id, name').eq('tenant_id', tenantId).order('name'),
      supabase.from('pipeline_stages').select('id, name, pipeline_id').eq('tenant_id', tenantId).order('name'),
    ]);
    if (tmplRes.data) setTemplates(tmplRes.data);
    if (listRes.data) setListings(listRes.data);
    if (pipeRes.data) setPipelines(pipeRes.data);
    if (stageRes.data) setStages(stageRes.data);

    const { data: intRes } = await supabase
      .from('tenant_integrations')
      .select('id, category, provider, connection_status, enabled, capabilities')
      .eq('tenant_id', tenantId)
      .eq('category', 'communication');
    if (intRes) setIntegrations(intRes as any);

    setLoading(false);
  }, [workflowId, router]);

  function initTree(triggerType: string) {
    const triggerLabel = TRIGGER_OPTIONS.find((t) => t.value === triggerType)?.label || triggerType;
    setTree({
      trigger: {
        id: 'trigger',
        type: 'trigger',
        label: triggerLabel,
        configuration: {},
      },
      children: [],
    });
  }

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsavedChanges]);

  // ============================================================
  // Tree manipulation helpers
  // ============================================================
  function deepCloneTree(t: BuilderDefinition): BuilderDefinition {
    return JSON.parse(JSON.stringify(t));
  }

  function findNode(t: BuilderDefinition, id: string): BuilderNode | null {
    if (t.trigger.id === id) return t.trigger;
    function search(nodes: BuilderNode[]): BuilderNode | null {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.branches) {
          const inTrue = search(n.branches.true);
          if (inTrue) return inTrue;
          const inFalse = search(n.branches.false);
          if (inFalse) return inFalse;
        }
      }
      return null;
    }
    return search(t.children);
  }

  function updateNodeInTree(id: string, updater: (n: BuilderNode) => BuilderNode) {
    setTree((prev) => {
      if (!prev) return prev;
      const cloned = deepCloneTree(prev);
      function update(nodes: BuilderNode[]): BuilderNode[] {
        return nodes.map((n) => {
          if (n.id === id) return updater(n);
          if (n.branches) {
            return { ...n, branches: { true: update(n.branches.true), false: update(n.branches.false) } };
          }
          return n;
        });
      }
      if (cloned.trigger.id === id) {
        cloned.trigger = updater(cloned.trigger);
      } else {
        cloned.children = update(cloned.children);
      }
      return cloned;
    });
  }

  function insertAfter(
    t: BuilderDefinition,
    parentId: string,
    afterNodeId: string | null,
    newNode: BuilderNode,
    branch?: 'true' | 'false'
  ): BuilderDefinition {
    const cloned = deepCloneTree(t);

    function insertInSequence(nodes: BuilderNode[], afterId: string | null): BuilderNode[] {
      if (afterId === null) return [newNode, ...nodes];
      const idx = nodes.findIndex((n) => n.id === afterId);
      if (idx === -1) return nodes;
      return [...nodes.slice(0, idx + 1), newNode, ...nodes.slice(idx + 1)];
    }

    function insertInBranches(nodes: BuilderNode[]): BuilderNode[] {
      return nodes.map((n) => {
        if (n.id === parentId && branch) {
          if (!n.branches) n.branches = { true: [], false: [] };
          if (branch === 'true') {
            n.branches.true = insertInSequence(n.branches.true, afterNodeId);
          } else {
            n.branches.false = insertInSequence(n.branches.false, afterNodeId);
          }
          return n;
        }
        if (n.branches) {
          return { ...n, branches: { true: insertInBranches(n.branches.true), false: insertInBranches(n.branches.false) } };
        }
        return n;
      });
    }

    if (parentId === 'trigger' && !branch) {
      cloned.children = insertInSequence(cloned.children, afterNodeId);
    } else {
      cloned.children = insertInBranches(cloned.children);
    }

    return cloned;
  }

  function deleteNodeFromTree(id: string) {
    setTree((prev) => {
      if (!prev) return prev;
      const cloned = deepCloneTree(prev);
      function removeFromList(nodes: BuilderNode[]): BuilderNode[] {
        return nodes
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.branches) {
              return { ...n, branches: { true: removeFromList(n.branches.true), false: removeFromList(n.branches.false) } };
            }
            return n;
          });
      }
      cloned.children = removeFromList(cloned.children);
      return cloned;
    });
    if (selectedNodeId === id) setSelectedNodeId(null);
    setUnsavedChanges(true);
  }

  function duplicateNode(id: string) {
    if (!tree) return;
    const node = findNode(tree, id);
    if (!node || node.type === 'trigger') return;
    const dup: BuilderNode = {
      ...JSON.parse(JSON.stringify(node)),
      id: generateNodeId(),
      label: `${node.label} (Copy)`,
    };
    if (dup.branches) {
      dup.branches = { true: regenBranchIds(dup.branches.true), false: regenBranchIds(dup.branches.false) };
    }
    // Find parent and insert after original
    setTree((prev) => {
      if (!prev) return prev;
      // Find which sequence contains this node
      const result = findAndInsertAfter(prev, id, dup);
      return result;
    });
    setUnsavedChanges(true);
  }

  function findAndInsertAfter(t: BuilderDefinition, afterId: string, newNode: BuilderNode): BuilderDefinition {
    const cloned = deepCloneTree(t);
    let inserted = false;

    function tryInsert(nodes: BuilderNode[]): BuilderNode[] {
      if (inserted) return nodes;
      const idx = nodes.findIndex((n) => n.id === afterId);
      if (idx !== -1) {
        inserted = true;
        return [...nodes.slice(0, idx + 1), newNode, ...nodes.slice(idx + 1)];
      }
      return nodes.map((n) => {
        if (n.branches) {
          return { ...n, branches: { true: tryInsert(n.branches.true), false: tryInsert(n.branches.false) } };
        }
        return n;
      });
    }

    cloned.children = tryInsert(cloned.children);
    return cloned;
  }

  // ============================================================
  // Add action
  // ============================================================
  function openPicker(parentId: string, afterNodeId: string | null, branch?: 'true' | 'false') {
    setPickerContext({ parentId, afterNodeId, branch });
    setPickerOpen(true);
  }

  function handlePickerSelect(actionType: string) {
    if (!tree || !pickerContext) return;
    const actionDef = getActionDef(actionType);
    if (!actionDef) return;

    const newNode: BuilderNode = {
      id: generateNodeId(),
      type: 'action',
      actionType: actionType as any,
      label: actionDef.label,
      configuration: getDefaultConfig(actionType),
    };

    // If it's a branch type, initialize empty branches
    if (actionType === 'if_else' || actionType === 'condition') {
      newNode.branches = { true: [], false: [] };
    }

    const newTree = insertAfter(tree, pickerContext.parentId, pickerContext.afterNodeId, newNode, pickerContext.branch);
    setTree(newTree);
    setSelectedNodeId(newNode.id);
    setUnsavedChanges(true);
    setPickerOpen(false);

    // Track recent
    setRecentActions((prev) => {
      const filtered = prev.filter((a) => a !== actionType);
      return [actionType, ...filtered].slice(0, 5);
    });
  }

  // ============================================================
  // Config panel updates
  // ============================================================
  function updateConfig(key: string, value: unknown) {
    if (!selectedNodeId) return;
    updateNodeInTree(selectedNodeId, (n) => ({
      ...n,
      configuration: { ...n.configuration, [key]: value },
    }));
    setUnsavedChanges(true);
    setSaveSuccess(false);
  }

  function updateLabel(label: string) {
    if (!selectedNodeId) return;
    updateNodeInTree(selectedNodeId, (n) => ({ ...n, label }));
    setUnsavedChanges(true);
  }

  function updateTriggerType(type: string) {
    if (!workflow || !tree) return;
    setWorkflow({ ...workflow, trigger_type: type });
    const label = TRIGGER_OPTIONS.find((t) => t.value === type)?.label || type;
    setTree((prev) => prev ? { ...prev, trigger: { ...prev.trigger, label } } : prev);
    setUnsavedChanges(true);
  }

  function toggleDisable(id: string) {
    updateNodeInTree(id, (n) => ({ ...n, disabled: !n.disabled }));
    setUnsavedChanges(true);
  }

  function toggleCollapse(id: string) {
    updateNodeInTree(id, (n) => ({ ...n, collapsed: !n.collapsed }));
  }

  function toggleFavorite(actionType: string) {
    setFavoriteActions((prev) =>
      prev.includes(actionType) ? prev.filter((a) => a !== actionType) : [...prev, actionType]
    );
  }

  // ============================================================
  // Validation
  // ============================================================
  const selectedNode = tree ? (selectedNodeId ? findNode(tree, selectedNodeId) : null) : null;

  useEffect(() => {
    if (!selectedNode || selectedNode.type === 'trigger') {
      setNodeConfigErrors([]);
      return;
    }
    if (!selectedNode.actionType) return;
    const { valid, errors } = validateNodeConfig(selectedNode.actionType, selectedNode.configuration || {});
    setNodeConfigErrors(valid ? [] : errors);
  }, [selectedNodeId, selectedNode]);

  function validateGraph(): string[] {
    if (!tree) return ['No workflow loaded'];
    const errors: string[] = [];
    const totalActions = countActions(tree.children);
    if (totalActions === 0) errors.push('Workflow must have at least one action');

    function validateNodes(nodes: BuilderNode[]) {
      for (const node of nodes) {
        if (node.disabled) continue;
        if (!node.actionType) continue;
        const { valid, errors: cfgErrors } = validateNodeConfig(node.actionType, node.configuration || {});
        if (!valid) {
          errors.push(`"${node.label}": ${cfgErrors.join(', ')}`);
        }
        if (node.actionType === 'if_else') {
          if (!node.branches || node.branches.true.length === 0) {
            errors.push(`"${node.label}": Yes branch is empty`);
          }
          if (!node.branches || node.branches.false.length === 0) {
            errors.push(`"${node.label}": No branch is empty`);
          }
        }
        if (node.branches) {
          validateNodes(node.branches.true);
          validateNodes(node.branches.false);
        }
      }
    }
    validateNodes(tree.children);

    // Communication nodes need templates
    function checkTemplates(nodes: BuilderNode[]) {
      for (const node of nodes) {
        const at = node.actionType;
        if (at === 'send_email' || at === 'send_sms' || at === 'send_whatsapp') {
          const tplId = node.configuration?.template_id;
          if (!tplId) errors.push(`"${node.label}": Template is required`);
          if (tplId) {
            const tpl = templates.find((t) => t.id === tplId);
            const expectedChannel = at.replace('send_', '');
            if (tpl && tpl.channel !== expectedChannel) {
              errors.push(`"${node.label}": Template channel mismatch`);
            }
          }
        }
        if (node.branches) {
          checkTemplates(node.branches.true);
          checkTemplates(node.branches.false);
        }
      }
    }
    checkTemplates(tree.children);

    return errors;
  }

  // ============================================================
  // Save & Publish
  // ============================================================
  function buildDefinition() {
    if (!tree) return { nodes: [], edges: [] };
    return treeToFlat(tree);
  }

  async function saveDraft() {
    if (!tenant || !workflow || !tree) return;
    setSaving(true);
    setSaveSuccess(false);
    const definition = buildDefinition();

    await supabase
      .from('automation_workflows')
      .update({
        name: workflow.name,
        description: workflow.description,
        trigger_type: workflow.trigger_type,
        trigger_configuration: workflow.trigger_configuration,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    const { data: existingDraft } = await supabase
      .from('automation_workflow_versions')
      .select('id, version_number')
      .eq('workflow_id', workflowId)
      .is('published_at', null)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDraft) {
      await supabase
        .from('automation_workflow_versions')
        .update({
          definition,
          trigger_type: workflow.trigger_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDraft.id);
    } else {
      const maxVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version_number)) : 0;
      await supabase
        .from('automation_workflow_versions')
        .insert({
          tenant_id: tenant.id,
          workflow_id: workflowId,
          version_number: maxVersion + 1,
          definition,
          trigger_type: workflow.trigger_type,
        });
    }

    setSaving(false);
    setSaveSuccess(true);
    setUnsavedChanges(false);
    await load(tenant.id);
  }

  function checkProviderReadiness(): string[] {
    if (!tree) return [];
    const warnings: string[] = [];
    const commChannels = new Set<string>();
    function walk(nodes: BuilderNode[]) {
      for (const node of nodes) {
        if (node.actionType === 'send_email') commChannels.add('email');
        if (node.actionType === 'send_sms') commChannels.add('sms');
        if (node.actionType === 'send_whatsapp') commChannels.add('whatsapp');
        if (node.branches) {
          walk(node.branches.true);
          walk(node.branches.false);
        }
      }
    }
    walk(tree.children);
    commChannels.forEach((channel) => {
      const hasIntegration = integrations.some((i) =>
        i.enabled && i.connection_status === 'connected' && (i as any).capabilities?.[channel] === true
      );
      if (!hasIntegration && !workflow?.test_mode) {
        warnings.push(`No connected ${channel} provider. Actions will be queued as action_required until a provider is connected.`);
      }
    });
    return warnings;
  }

  async function publish() {
    if (!tenant || !workflow || !tree) return;
    const errors = validateGraph();
    setValidationErrors(errors);
    setPublishError(null);
    if (errors.length > 0) return;

    const warnings = checkProviderReadiness();
    setProviderWarnings(warnings);

    setPublishing(true);
    const definition = buildDefinition();

    const { data: result, error } = await supabase.rpc('publish_workflow_version', {
      p_workflow_id: workflowId,
      p_definition: definition,
      p_trigger_type: workflow.trigger_type,
      p_tenant_id: tenant.id,
    });

    if (error) {
      setPublishError(error.message || 'Publication failed server-side validation');
      setPublishing(false);
      return;
    }

    setPublishing(false);
    if (result) {
      setUnsavedChanges(false);
      setPublishError(null);
      await load(tenant.id);
    }
  }

  // ============================================================
  // Test execution (visual simulation only)
  // ============================================================
  async function runTest() {
    if (!tree || testing) return;
    setTesting(true);
    setExecutionStates({});

    // Collect all node IDs in execution order
    const orderedIds: string[] = ['trigger'];
    function collect(nodes: BuilderNode[]) {
      for (const node of nodes) {
        orderedIds.push(node.id);
        if (node.branches) {
          collect(node.branches.true);
          collect(node.branches.false);
        }
      }
    }
    collect(tree.children);

    // Animate through each node
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      setExecutionStates((prev) => ({ ...prev, [id]: 'running' }));
      await sleep(600);

      // Check if it's a wait node
      const node = findNode(tree, id);
      if (node?.actionType === 'wait' || node?.actionType === 'wait_until') {
        setExecutionStates((prev) => ({ ...prev, [id]: 'waiting' }));
        await sleep(800);
      }

      // Randomly fail 0% for demo (always succeed)
      setExecutionStates((prev) => ({ ...prev, [id]: 'completed' }));
      await sleep(200);
    }

    setTesting(false);
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================
  // Zoom & Pan
  // ============================================================
  function handleZoomIn() { setZoom((z) => Math.min(z + 0.1, 2)); }
  function handleZoomOut() { setZoom((z) => Math.max(z - 0.1, 0.4)); }
  function handleFitScreen() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleMouseDown(e: React.MouseEvent) {
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isPanning) return;
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    });
  }

  function handleMouseUp() {
    setIsPanning(false);
  }

  // ============================================================
  // Render
  // ============================================================
  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1524]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  if (role !== 'tenant_admin' || !workflow || !tree) return null;

  const totalActions = countActions(tree.children);
  const totalConditions = countConditions(tree.children);
  const estTime = estimateExecutionTime(tree.children);
  const activeIntegrations = getActiveIntegrations(tree.children);
  const latestVersion = versions.find((v) => v.published_at !== null);

  return (
    <div className="flex h-screen flex-col bg-[#0F1524]">
      {/* ============================================================ */}
      {/* Header */}
      {/* ============================================================ */}
      <header className="flex items-center justify-between border-b border-white/[0.06] bg-[#121827] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/automations')}
            className="rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Input
            value={workflow.name}
            onChange={(e) => { setWorkflow({ ...workflow, name: e.target.value }); setUnsavedChanges(true); setSaveSuccess(false); }}
            className="w-64 border-transparent bg-white/[0.03] text-sm font-semibold text-white"
          />
          <div className="flex items-center gap-2">
            <span className={cn(
              'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize',
              workflow.status === 'active' ? 'border-[#22C55E]/20 bg-[#22C55E]/8 text-[#22C55E]' :
              workflow.status === 'paused' ? 'border-[#F59E0B]/20 bg-[#F59E0B]/8 text-[#F59E0B]' :
              'border-white/[0.08] bg-white/[0.03] text-[#94A3B8]'
            )}>
              {workflow.status}
            </span>
            {latestVersion && (
              <span className="text-[10px] text-[#94A3B8]/60">
                v{latestVersion.version_number} · Published {new Date(latestVersion.published_at!).toLocaleDateString()}
              </span>
            )}
          </div>
          {unsavedChanges && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[#F59E0B]">
              <AlertCircle className="h-3 w-3" /> Unsaved
            </span>
          )}
          {saveSuccess && !unsavedChanges && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-[#22C55E]">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          )}
          {workflow.test_mode && (
            <span className="flex items-center gap-1 rounded-full border border-[#8B5CF6]/20 bg-[#8B5CF6]/8 px-2 py-0.5 text-[10px] font-medium text-[#8B5CF6]">
              <FlaskConical className="h-3 w-3" /> Test Mode
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {validationErrors.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-[#EF4444]">
              <AlertCircle className="h-3.5 w-3.5" />
              {validationErrors.length} issue(s)
            </span>
          )}
          {publishError && (
            <span className="flex items-center gap-1 text-xs text-[#EF4444]">
              <ShieldAlert className="h-3.5 w-3.5" /> Server rejected
            </span>
          )}
          <button
            onClick={() => router.push(`/automations/${workflowId}/history`)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs font-medium text-[#94A3B8] transition-colors hover:text-white"
          >
            <History className="h-3.5 w-3.5" />
            History
          </button>
          <button
            onClick={runTest}
            disabled={testing}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.04]"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {testing ? 'Testing...' : 'Run Test'}
          </button>
          <button
            onClick={saveDraft}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.04]"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Draft
          </button>
          <button
            onClick={publish}
            disabled={publishing}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#7283FF] operan-glow-sm"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Publish
          </button>
        </div>
      </header>

      {/* Error banners */}
      {publishError && (
        <div className="border-b border-[#EF4444]/20 bg-[#EF4444]/8 px-4 py-2 text-xs text-[#EF4444]">
          <strong>Publication rejected:</strong> {publishError}
        </div>
      )}
      {providerWarnings.length > 0 && !publishError && (
        <div className="border-b border-[#F59E0B]/20 bg-[#F59E0B]/8 px-4 py-2 text-xs text-[#F59E0B]">
          {providerWarnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="border-b border-[#EF4444]/20 bg-[#EF4444]/8 px-4 py-2 text-xs text-[#EF4444]">
          {validationErrors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
          {validationErrors.length > 3 && <div>...and {validationErrors.length - 3} more</div>}
        </div>
      )}

      {/* ============================================================ */}
      {/* Main layout */}
      {/* ============================================================ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left summary panel */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-white/[0.07] bg-[#192235] p-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/50">
            Workflow Summary
          </div>

          {/* Trigger */}
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#202A40] p-3 transition-colors hover:bg-white/[0.04]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(99,119,255,0.15)] text-[var(--brand-primary)]">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]/60">Trigger</div>
                <div className="text-xs font-medium text-white">{tree.trigger.label}</div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-3 space-y-2">
            <SummaryStat icon={<Layers className="h-3.5 w-3.5" />} label="Total Actions" value={String(totalActions)} />
            <SummaryStat icon={<GitBranch className="h-3.5 w-3.5" />} label="Conditions" value={String(totalConditions)} />
            <SummaryStat icon={<Clock className="h-3.5 w-3.5" />} label="Est. Execution" value={estTime} />
          </div>

          {/* Active integrations */}
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/50">
              Active Integrations
            </div>
            {activeIntegrations.length === 0 ? (
              <p className="text-xs text-[#94A3B8]/40">No integrations used</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeIntegrations.map((int) => (
                  <span
                    key={int}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] font-medium text-[#94A3B8]"
                  >
                    {int}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Test mode toggle */}
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#202A40] p-3 transition-colors hover:bg-white/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white">Test Mode</span>
              <Switch
                checked={workflow.test_mode || false}
                onCheckedChange={(checked) => {
                  setWorkflow({ ...workflow, test_mode: checked });
                  setUnsavedChanges(true);
                }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-[#94A3B8]/60">
              Logs executions without sending real messages
            </p>
          </div>
        </aside>

        {/* Center canvas */}
        <div
          className="relative flex-1 overflow-hidden bg-[#0F1524]"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
          <div className="pointer-events-none absolute inset-0 operan-canvas-radial" />

          {/* Zoom controls */}
          <div className="absolute right-4 top-4 z-10 flex flex-col gap-1">
            <button
              onClick={handleZoomIn}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151D2E] text-[#94A3B8] shadow-lg transition-colors hover:text-white"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151D2E] text-[#94A3B8] shadow-lg transition-colors hover:text-white"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={handleFitScreen}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151D2E] text-[#94A3B8] shadow-lg transition-colors hover:text-white"
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>

          {/* Zoom indicator */}
          <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/[0.08] bg-[#151D2E] px-2.5 py-1 text-[10px] font-medium text-[#94A3B8]">
            {Math.round(zoom * 100)}%
          </div>

          {/* Mini map */}
          {showMiniMap && (
            <div className="absolute bottom-4 right-4 z-10 h-32 w-48 overflow-hidden rounded-xl border border-white/[0.07] bg-[#151D2E]/85 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-2 py-1">
                <span className="text-[9px] font-medium text-[#94A3B8]/60">Mini Map</span>
                <button
                  onClick={() => setShowMiniMap(false)}
                  className="text-[#94A3B8]/40 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="relative h-full p-2">
                <MiniMapContent tree={tree} selectedNodeId={selectedNodeId} />
              </div>
            </div>
          )}
          {!showMiniMap && (
            <button
              onClick={() => setShowMiniMap(true)}
              className="absolute bottom-4 right-4 z-10 rounded-lg border border-white/[0.07] bg-[#151D2E] px-2.5 py-1.5 text-[10px] font-medium text-[#94A3B8]"
            >
              Show Mini Map
            </button>
          )}

          {/* Canvas content */}
          <div
            className="absolute inset-0 overflow-auto"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transformOrigin: 'center top',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <div className="flex min-h-full items-start justify-center px-8 py-12">
              <TreeRenderer
                tree={tree}
                selectedNodeId={selectedNodeId}
                executionStates={executionStates}
                onSelectNode={setSelectedNodeId}
                onAddAfter={openPicker}
                onDuplicate={duplicateNode}
                onDelete={deleteNodeFromTree}
                onToggleDisable={toggleDisable}
                onToggleCollapse={toggleCollapse}
              />
            </div>
          </div>
        </div>

        {/* Right config panel */}
        <aside className="w-80 shrink-0 border-l border-white/[0.08] bg-[#182033]">
          <ConfigPanel
            node={selectedNode}
            workflow={workflow}
            templates={templates}
            listings={listings}
            pipelines={pipelines}
            stages={stages}
            configErrors={nodeConfigErrors}
            onUpdateConfig={updateConfig}
            onUpdateLabel={updateLabel}
            onUpdateTriggerType={updateTriggerType}
            onDelete={() => selectedNodeId && deleteNodeFromTree(selectedNodeId)}
            onClose={() => setSelectedNodeId(null)}
          />
        </aside>
      </div>

      {/* Action picker */}
      <ActionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        recentActions={recentActions}
        favoriteActions={favoriteActions}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}

// ============================================================
// Helper components
// ============================================================

function SummaryStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#202A40] px-3 py-2 transition-colors hover:bg-white/[0.04]">
      <div className="flex items-center gap-2 text-[#94A3B8]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

function MiniMapContent({ tree, selectedNodeId }: { tree: BuilderDefinition; selectedNodeId: string | null }) {
  // Render a simplified vertical representation
  const items: { id: string; type: string; depth: number }[] = [];
  function collect(nodes: BuilderNode[], depth: number) {
    for (const node of nodes) {
      items.push({ id: node.id, type: node.actionType || 'action', depth });
      if (node.branches) {
        collect(node.branches.true, depth + 1);
        collect(node.branches.false, depth + 1);
      }
    }
  }
  items.push({ id: 'trigger', type: 'trigger', depth: 0 });
  collect(tree.children, 0);

  return (
    <div className="flex flex-col items-center gap-0.5">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'h-2 rounded-sm',
            item.type === 'trigger' ? 'w-12 bg-[var(--brand-primary)]' :
            item.type === 'if_else' || item.type === 'condition' ? 'w-10 bg-[#8B5CF6]/40' :
            'w-8 bg-white/10',
            selectedNodeId === item.id && 'ring-1 ring-[var(--brand-primary)]/40'
          )}
          style={{ marginLeft: item.depth * 8 }}
        />
      ))}
    </div>
  );
}


