// ============================================================
// Workflow Builder — Types, Constants, and Helpers
// Pure data layer. No React. No engine changes.
// ============================================================

export type ActionType =
  | 'send_email'
  | 'send_sms'
  | 'send_whatsapp'
  | 'create_in_app_notification'
  | 'wait'
  | 'wait_until'
  | 'if_else'
  | 'condition'
  | 'add_customer_tag'
  | 'add_reservation_note'
  | 'call_webhook'
  | 'stop_workflow'
  | 'create_task'
  | 'update_opportunity_stage';

export type ExecutionState = 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped';

export interface BuilderNode {
  id: string;
  type: 'trigger' | 'action';
  actionType?: ActionType;
  label: string;
  configuration: Record<string, unknown>;
  collapsed?: boolean;
  disabled?: boolean;
  // For condition branches
  branches?: {
    true: BuilderNode[];
    false: BuilderNode[];
  };
}

export interface BuilderDefinition {
  trigger: BuilderNode;
  // Sequential children of the trigger
  children: BuilderNode[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_configuration: Record<string, unknown>;
  status: string;
  active_version: number | null;
  test_mode?: boolean;
}

export interface Version {
  id: string;
  version_number: number;
  definition: { nodes: any[]; edges: any[] };
  published_at: string | null;
}

// ============================================================
// Trigger Options
// ============================================================

export const TRIGGER_OPTIONS = [
  { value: 'reservation.created', label: 'Reservation Created' },
  { value: 'reservation.hold_created', label: 'Booking Hold Created' },
  { value: 'reservation.requested', label: 'Booking Requested' },
  { value: 'reservation.confirmed', label: 'Reservation Confirmed' },
  { value: 'reservation.cancelled', label: 'Reservation Cancelled' },
  { value: 'reservation.expired', label: 'Reservation Expired' },
  { value: 'reservation.completed', label: 'Reservation Completed' },
  { value: 'payment.succeeded', label: 'Payment Succeeded' },
  { value: 'payment.failed', label: 'Payment Failed' },
  { value: 'waiver.signed', label: 'Waiver Signed' },
  { value: 'customer.created', label: 'Customer Created' },
  { value: 'opportunity.stage_changed', label: 'Pipeline Stage Changed' },
] as const;

// ============================================================
// Action Catalog — categorized for the picker
// ============================================================

export interface ActionCatalogEntry {
  type: ActionType;
  label: string;
  category: string;
  icon: string; // lucide icon name
  color: string; // hex accent
  desc: string;
}

export const ACTION_CATEGORIES = [
  {
    name: 'Communication',
    actions: [
      { type: 'send_email', label: 'Email', icon: 'Mail', color: '#6377FF', desc: 'Send an email to the customer or a custom recipient' },
      { type: 'send_sms', label: 'SMS', icon: 'Smartphone', color: '#22C55E', desc: 'Send an SMS message' },
      { type: 'send_whatsapp', label: 'WhatsApp', icon: 'MessageSquare', color: '#25D366', desc: 'Send a WhatsApp message' },
      { type: 'create_in_app_notification', label: 'Push Notification', icon: 'Bell', color: '#F59E0B', desc: 'Create an in-app notification for the team' },
    ],
  },
  {
    name: 'Reservation',
    actions: [
      { type: 'add_reservation_note', label: 'Add Note', icon: 'FileText', color: '#94A3B8', desc: 'Add an internal or customer-visible note' },
      { type: 'stop_workflow', label: 'Cancel Reservation', icon: 'Square', color: '#EF4444', desc: 'Stop the workflow and cancel the reservation' },
    ],
  },
  {
    name: 'Customer',
    actions: [
      { type: 'add_customer_tag', label: 'Add Tag', icon: 'Tag', color: '#6366F1', desc: 'Add a tag to the customer record' },
    ],
  },
  {
    name: 'Timing',
    actions: [
      { type: 'wait', label: 'Wait', icon: 'Clock', color: '#94A3B8', desc: 'Pause for a fixed duration' },
      { type: 'wait_until', label: 'Wait Until', icon: 'Clock', color: '#94A3B8', desc: 'Pause until a specific event or time' },
    ],
  },
  {
    name: 'Conditions',
    actions: [
      { type: 'if_else', label: 'If / Else', icon: 'Split', color: '#8B5CF6', desc: 'Branch the workflow based on a condition' },
      { type: 'condition', label: 'Condition', icon: 'GitBranch', color: '#8B5CF6', desc: 'Evaluate a condition without branching' },
    ],
  },
  {
    name: 'Integrations',
    actions: [
      { type: 'call_webhook', label: 'Webhook', icon: 'Webhook', color: '#06B6D4', desc: 'Call an external webhook URL' },
    ],
  },
  {
    name: 'Internal',
    actions: [
      { type: 'create_task', label: 'Task', icon: 'CheckSquare', color: '#6377FF', desc: 'Create an internal task' },
      { type: 'update_opportunity_stage', label: 'Move Pipeline Stage', icon: 'GitBranch', color: '#6377FF', desc: 'Move an opportunity to a new pipeline stage' },
    ],
  },
] as const;

export const ALL_ACTIONS: ActionCatalogEntry[] = ACTION_CATEGORIES.flatMap((cat) =>
  cat.actions.map((a) => ({ ...a, category: cat.name }))
);

export function getActionDef(actionType: string): ActionCatalogEntry | undefined {
  return ALL_ACTIONS.find((a) => a.type === actionType);
}

// ============================================================
// Flat graph <-> Tree conversion
// The engine stores nodes as a flat array + edges.
// The builder UI works with a tree (sequential + branches).
// These helpers convert between the two without changing
// what gets saved to the database.
// ============================================================

export function flatToTree(
  flatNodes: any[],
  flatEdges: any[],
  triggerType: string
): BuilderDefinition {
  const triggerLabel = TRIGGER_OPTIONS.find((t) => t.value === triggerType)?.label || triggerType;

  const triggerNode: BuilderNode = {
    id: 'trigger',
    type: 'trigger',
    label: triggerLabel,
    configuration: {},
  };

  // Build adjacency from edges
  const childrenOf: Record<string, BuilderNode[]> = {};
  const trueBranchOf: Record<string, BuilderNode[]> = {};
  const falseBranchOf: Record<string, BuilderNode[]> = {};
  const nodeMap: Record<string, any> = {};

  for (const n of flatNodes) {
    nodeMap[n.node_id || n.id] = n;
  }

  for (const e of flatEdges) {
    const source = e.source;
    const target = e.target;
    const handle = e.source_handle || e.condition_label?.toLowerCase() || '';

    const targetNode = nodeMap[target];
    if (!targetNode) continue;

    const actionDef = getActionDef(targetNode.action_type || targetNode.type);

    const builderNode: BuilderNode = {
      id: targetNode.node_id || targetNode.id,
      type: 'action',
      actionType: targetNode.action_type,
      label: actionDef?.label || targetNode.action_type || 'Action',
      configuration: targetNode.configuration || {},
    };

    if (handle === 'true') {
      if (!trueBranchOf[source]) trueBranchOf[source] = [];
      trueBranchOf[source].push(builderNode);
    } else if (handle === 'false') {
      if (!falseBranchOf[source]) falseBranchOf[source] = [];
      falseBranchOf[source].push(builderNode);
    } else {
      if (!childrenOf[source]) childrenOf[source] = [];
      childrenOf[source].push(builderNode);
    }
  }

  function collectChain(startId: string): BuilderNode[] {
    const result: BuilderNode[] = [];
    let currentId = startId;

    while (childrenOf[currentId] && childrenOf[currentId].length > 0) {
      const child = childrenOf[currentId][0];

      if (child.actionType === 'if_else' || child.actionType === 'condition') {
        child.branches = {
          true: collectBranch(child.id, 'true'),
          false: collectBranch(child.id, 'false'),
        };
      }

      result.push(child);
      currentId = child.id;
    }

    return result;
  }

  function collectBranch(parentId: string, branch: 'true' | 'false'): BuilderNode[] {
    const list = branch === 'true' ? trueBranchOf[parentId] || [] : falseBranchOf[parentId] || [];
    const result: BuilderNode[] = [];
    for (const node of list) {
      if (node.actionType === 'if_else' || node.actionType === 'condition') {
        node.branches = {
          true: collectBranch(node.id, 'true'),
          false: collectBranch(node.id, 'false'),
        };
      }
      result.push(node);
      result.push(...collectChain(node.id));
    }
    return result;
  }

  return {
    trigger: triggerNode,
    children: collectChain('trigger'),
  };
}

export function treeToFlat(tree: BuilderDefinition): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];
  let edgeCounter = 0;

  // Trigger node
  nodes.push({
    node_id: 'trigger',
    type: 'trigger',
    action_type: 'trigger',
    configuration: {},
    position_x: 0,
    position_y: 0,
  });

  function processSequence(
    sequence: BuilderNode[],
    parentId: string,
    handle?: string
  ) {
    let currentParent = parentId;
    let currentHandle = handle;

    for (const node of sequence) {
      nodes.push({
        node_id: node.id,
        type: 'action',
        action_type: node.actionType,
        configuration: node.configuration,
        position_x: 0,
        position_y: 0,
      });

      edges.push({
        id: `e_${edgeCounter++}`,
        source: currentParent,
        target: node.id,
        source_handle: currentHandle || null,
        condition_label: currentHandle
          ? currentHandle === 'true'
            ? 'True'
            : 'False'
          : null,
      });

      // If this is a branch node, process its branches
      if (node.branches) {
        if (node.branches.true.length > 0) {
          processSequence(node.branches.true, node.id, 'true');
        }
        if (node.branches.false.length > 0) {
          processSequence(node.branches.false, node.id, 'false');
        }
      }

      // Next node in this sequence connects from this node (sequential)
      currentParent = node.id;
      currentHandle = undefined;
    }
  }

  processSequence(tree.children, 'trigger');
  return { nodes, edges };
}

// ============================================================
// ID generation
// ============================================================

export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Summary helpers (delegates to node-config but provides
// a clean interface for the UI)
// ============================================================

export function getSummary(node: BuilderNode): string {
  if (node.type === 'trigger') return '';
  if (!node.actionType) return '';
  const config = node.configuration || {};
  switch (node.actionType) {
    case 'send_email':
    case 'send_sms':
    case 'send_whatsapp': {
      const channel = node.actionType.replace('send_', '');
      const recipient = config.recipient_type === 'custom' ? config.recipient_override || 'Custom' : 'Customer';
      return `${channel.charAt(0).toUpperCase() + channel.slice(1)} → ${recipient}`;
    }
    case 'wait':
      return `${config.duration_value || 1} ${config.duration_unit || 'hours'}`;
    case 'wait_until':
      return `${(config.target_type as string) || 'reservation_start'}`.replace(/_/g, ' ');
    case 'if_else':
    case 'condition': {
      const op = (config.operator as string) || 'equals';
      const val = (config.comparison_value as string) || '';
      return `${(config.field_path as string) || '?'} ${op.replace(/_/g, ' ')} ${val}`;
    }
    case 'create_in_app_notification':
      return (config.title as string) || 'Notification';
    case 'add_customer_tag':
      return `Tag: ${config.tag || ''}`;
    case 'add_reservation_note':
      return 'Add note';
    case 'call_webhook': {
      const url = config.url as string;
      try {
        return url ? new URL(url).hostname : 'Webhook';
      } catch {
        return 'Webhook';
      }
    }
    case 'stop_workflow':
      return 'Stop';
    case 'create_task':
      return (config.title as string) || 'New task';
    case 'update_opportunity_stage':
      return 'Move to stage';
    default:
      return '';
  }
}

// ============================================================
// Execution state helpers
// ============================================================

export const EXECUTION_STATE_CONFIG: Record<
  ExecutionState,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  idle: { label: 'Pending', color: '#94A3B8', bgColor: 'rgba(148,163,184,0.1)', icon: 'Circle' },
  running: { label: 'Running', color: '#6377FF', bgColor: 'rgba(99,119,255,0.1)', icon: 'Loader' },
  waiting: { label: 'Waiting', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)', icon: 'Clock' },
  completed: { label: 'Completed', color: '#22C55E', bgColor: 'rgba(34,197,94,0.1)', icon: 'Check' },
  failed: { label: 'Failed', color: '#EF4444', bgColor: 'rgba(239,68,68,0.1)', icon: 'X' },
  skipped: { label: 'Skipped', color: '#94A3B8', bgColor: 'rgba(148,163,184,0.05)', icon: 'Minus' },
};

// ============================================================
// Estimated execution time
// ============================================================

export function estimateExecutionTime(children: BuilderNode[]): string {
  let totalMinutes = 0;

  function walk(nodes: BuilderNode[]) {
    for (const node of nodes) {
      if (node.actionType === 'wait') {
        const val = (node.configuration.duration_value as number) || 1;
        const unit = (node.configuration.duration_unit as string) || 'hours';
        if (unit === 'minutes') totalMinutes += val;
        else if (unit === 'hours') totalMinutes += val * 60;
        else if (unit === 'days') totalMinutes += val * 60 * 24;
      }
      if (node.branches) {
        const trueTime = estimateExecutionTime(node.branches.true);
        const falseTime = estimateExecutionTime(node.branches.false);
        // Take the longer branch
        const trueMin = parseTimeToMinutes(trueTime);
        const falseMin = parseTimeToMinutes(falseTime);
        totalMinutes += Math.max(trueMin, falseMin);
      }
    }
  }

  walk(children);

  if (totalMinutes < 60) return `${totalMinutes}m`;
  if (totalMinutes < 1440) return `${Math.round(totalMinutes / 60)}h`;
  return `${Math.round(totalMinutes / 1440)}d`;
}

function parseTimeToMinutes(time: string): number {
  const match = time.match(/(\d+)([mhd])/);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'm') return val;
  if (unit === 'h') return val * 60;
  if (unit === 'd') return val * 60 * 24;
  return 0;
}

// ============================================================
// Count helpers for summary panel
// ============================================================

export function countActions(children: BuilderNode[]): number {
  let count = 0;
  function walk(nodes: BuilderNode[]) {
    for (const node of nodes) {
      count++;
      if (node.branches) {
        walk(node.branches.true);
        walk(node.branches.false);
      }
    }
  }
  walk(children);
  return count;
}

export function countConditions(children: BuilderNode[]): number {
  let count = 0;
  function walk(nodes: BuilderNode[]) {
    for (const node of nodes) {
      if (node.actionType === 'if_else' || node.actionType === 'condition') count++;
      if (node.branches) {
        walk(node.branches.true);
        walk(node.branches.false);
      }
    }
  }
  walk(children);
  return count;
}

export function getActiveIntegrations(children: BuilderNode[]): string[] {
  const integrations = new Set<string>();
  function walk(nodes: BuilderNode[]) {
    for (const node of nodes) {
      if (node.actionType === 'send_email') integrations.add('Resend');
      if (node.actionType === 'send_sms') integrations.add('Twilio');
      if (node.actionType === 'send_whatsapp') integrations.add('WhatsApp');
      if (node.actionType === 'call_webhook') integrations.add('Webhook');
      if (node.branches) {
        walk(node.branches.true);
        walk(node.branches.false);
      }
    }
  }
  walk(children);
  return Array.from(integrations);
}
