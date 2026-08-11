'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, X } from 'lucide-react';
import {
  type BuilderNode,
  type Workflow,
  TRIGGER_OPTIONS,
  getActionDef,
} from './builder-types';

const NONE_VALUE = '__none__';

interface ConfigPanelProps {
  node: BuilderNode | null;
  workflow: Workflow | null;
  templates: { id: string; name: string; channel: string }[];
  listings: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
  stages: { id: string; name: string; pipeline_id: string }[];
  configErrors: string[];
  onUpdateConfig: (key: string, value: unknown) => void;
  onUpdateLabel: (label: string) => void;
  onUpdateTriggerType: (type: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ConfigPanel({
  node,
  workflow,
  templates,
  listings,
  pipelines,
  stages,
  configErrors,
  onUpdateConfig,
  onUpdateLabel,
  onUpdateTriggerType,
  onDelete,
  onClose,
}: ConfigPanelProps) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#202A40]">
          <svg className="h-5 w-5 text-[#94A3B8]/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <p className="mt-3 text-sm text-[#94A3B8]">Select a step to configure</p>
        <p className="mt-1 text-xs text-[#94A3B8]/60">Click any node in the workflow</p>
      </div>
    );
  }

  const isTrigger = node.type === 'trigger';
  const actionDef = !isTrigger ? getActionDef(node.actionType || '') : null;
  const config = node.configuration || {};

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#1B2438] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]/60">
            {isTrigger ? 'Trigger' : actionDef?.label || 'Action'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isTrigger && (
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Label */}
        <div className="mb-4">
          <Label className="text-xs text-[#94A3B8]">Step Name</Label>
          <Input
            value={node.label}
            onChange={(e) => onUpdateLabel(e.target.value)}
            className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
          />
        </div>

        {/* Validation errors */}
        {configErrors.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/6 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#FBBF24]">
              Configuration Issues
            </div>
            <div className="mt-1.5 space-y-1">
              {configErrors.map((err, i) => (
                <div key={i} className="text-xs text-[#FBBF24]/80">
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trigger config */}
        {isTrigger && workflow && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Trigger Type</Label>
              <Select value={workflow.trigger_type} onValueChange={onUpdateTriggerType}>
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Filter by Listing (optional)</Label>
              <Select
                value={(config.listing_id as string) || NONE_VALUE}
                onValueChange={(v) => onUpdateConfig('listing_id', v === NONE_VALUE ? undefined : v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue placeholder="All listings" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>All listings</SelectItem>
                  {listings
                    .filter((l) => l.id && l.id.trim() !== '')
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Send email/sms/whatsapp config */}
        {!isTrigger && node.actionType?.startsWith('send_') && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Template</Label>
              <Select
                value={(config.template_id as string) || NONE_VALUE}
                onValueChange={(v) => onUpdateConfig('template_id', v === NONE_VALUE ? undefined : v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>No template</SelectItem>
                  {templates
                    .filter((t) => {
                      const channel = node.actionType!.replace('send_', '');
                      return t.channel === channel && typeof t.id === 'string' && t.id.trim() !== '';
                    })
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {!config.template_id && node.actionType === 'send_email' && (
              <>
                <div>
                  <Label className="text-xs text-[#94A3B8]">Subject</Label>
                  <Input
                    className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                    value={(config.subject as string) || ''}
                    onChange={(e) => onUpdateConfig('subject', e.target.value)}
                    placeholder="e.g. Your reservation is confirmed!"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#94A3B8]">Body</Label>
                  <Textarea
                    className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white resize-none"
                    rows={5}
                    value={(config.body as string) || ''}
                    onChange={(e) => onUpdateConfig('body', e.target.value)}
                    placeholder="Hi {{customer_name}}, your reservation on {{vessel_name}} for {{rental_date}} is confirmed..."
                  />
                  <p className="mt-1 text-[10px] text-[#94A3B8]/60">Use {'{{customer.name}}'}, {'{{listing.name}}'}, {'{{reservation.date}}'}, {'{{reservation.start_time}}'}, {'{{tenant.name}}'}, {'{{waiver.signing_url}}'}, {'{{captain.url}}'} as placeholders.</p>
                </div>
              </>
            )}
            {!config.template_id && (node.actionType === 'send_sms' || node.actionType === 'send_whatsapp') && (
              <div>
                <Label className="text-xs text-[#94A3B8]">Message</Label>
                <Textarea
                  className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white resize-none"
                  rows={4}
                  value={(config.body as string) || ''}
                  onChange={(e) => onUpdateConfig('body', e.target.value)}
                  placeholder="Hi {{customer.name}}, your reservation is confirmed for {{reservation.date}}..."
                />
                <p className="mt-1 text-[10px] text-[#94A3B8]/60">Use {'{{customer.name}}'}, {'{{listing.name}}'}, {'{{reservation.date}}'}, {'{{waiver.signing_url}}'} as placeholders.</p>
              </div>
            )}
            <div>
              <Label className="text-xs text-[#94A3B8]">Recipient</Label>
              <Select
                value={(config.recipient_type as string) || 'customer'}
                onValueChange={(v) => onUpdateConfig('recipient_type', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer (auto-resolve)</SelectItem>
                  <SelectItem value="custom">Custom recipient</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.recipient_type === 'custom' && (
              <div>
                <Label className="text-xs text-[#94A3B8]">Custom Recipient</Label>
                <Input
                  className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                  value={(config.recipient_override as string) || ''}
                  onChange={(e) => onUpdateConfig('recipient_override', e.target.value)}
                  placeholder={node.actionType === 'send_email' ? 'email@example.com' : '+1234567890'}
                />
              </div>
            )}
            <div>
              <Label className="text-xs text-[#94A3B8]">Classification</Label>
              <Select
                value={(config.message_classification as string) || 'transactional'}
                onValueChange={(v) => onUpdateConfig('message_classification', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactional">Transactional</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Wait config */}
        {!isTrigger && node.actionType === 'wait' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Duration</Label>
              <Input
                type="number"
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                value={(config.duration_value as number) || 1}
                onChange={(e) => onUpdateConfig('duration_value', parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Unit</Label>
              <Select
                value={(config.duration_unit as string) || 'hours'}
                onValueChange={(v) => onUpdateConfig('duration_unit', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Wait Until config */}
        {!isTrigger && node.actionType === 'wait_until' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Target</Label>
              <Select
                value={(config.target_type as string) || 'reservation_start'}
                onValueChange={(v) => onUpdateConfig('target_type', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reservation_start">Reservation Start</SelectItem>
                  <SelectItem value="reservation_end">Reservation End</SelectItem>
                  <SelectItem value="specific_time">Specific Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.target_type === 'specific_time' && (
              <div>
                <Label className="text-xs text-[#94A3B8]">Timestamp</Label>
                <Input
                  type="datetime-local"
                  className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                  value={(config.target_timestamp as string) || ''}
                  onChange={(e) => onUpdateConfig('target_timestamp', e.target.value)}
                />
              </div>
            )}
            <div>
              <Label className="text-xs text-[#94A3B8]">Offset</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="number"
                  className="flex-1 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                  value={(config.offset_value as number) || 0}
                  onChange={(e) => onUpdateConfig('offset_value', parseInt(e.target.value) || 0)}
                />
                <Select
                  value={(config.offset_unit as string) || 'hours'}
                  onValueChange={(v) => onUpdateConfig('offset_unit', v)}
                >
                  <SelectTrigger className="w-24 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Min</SelectItem>
                    <SelectItem value="hours">Hrs</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* If/Else & Condition config */}
        {!isTrigger && (node.actionType === 'if_else' || node.actionType === 'condition') && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Property Path</Label>
              <Input
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="reservation.balance_due"
                value={(config.field_path as string) || ''}
                onChange={(e) => onUpdateConfig('field_path', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Operator</Label>
              <Select
                value={(config.operator as string) || 'equals'}
                onValueChange={(v) => onUpdateConfig('operator', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="not_equals">Not Equals</SelectItem>
                  <SelectItem value="greater_than">Greater Than</SelectItem>
                  <SelectItem value="less_than">Less Than</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="not_contains">Not Contains</SelectItem>
                  <SelectItem value="exists">Exists</SelectItem>
                  <SelectItem value="not_exists">Not Exists</SelectItem>
                  <SelectItem value="is_true">Is True</SelectItem>
                  <SelectItem value="is_false">Is False</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Comparison Value</Label>
              <Input
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="0"
                value={(config.comparison_value as string) || ''}
                onChange={(e) => onUpdateConfig('comparison_value', e.target.value)}
              />
            </div>
            {node.actionType === 'if_else' && (
              <div className="rounded-xl border border-white/[0.06] bg-[#202A40] p-3">
                <p className="text-xs text-[#94A3B8]">
                  The <span className="font-medium text-[#22C55E]">YES</span> branch runs when the condition is met.
                  The <span className="font-medium text-[#EF4444]">NO</span> branch runs when it is not.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Add Customer Tag */}
        {!isTrigger && node.actionType === 'add_customer_tag' && (
          <div>
            <Label className="text-xs text-[#94A3B8]">Tag</Label>
            <Input
              className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
              placeholder="VIP"
              value={(config.tag as string) || ''}
              onChange={(e) => onUpdateConfig('tag', e.target.value)}
            />
          </div>
        )}

        {/* Add Reservation Note */}
        {!isTrigger && node.actionType === 'add_reservation_note' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Note</Label>
              <Textarea
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="Note text..."
                value={(config.body as string) || ''}
                onChange={(e) => onUpdateConfig('body', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Visibility</Label>
              <Select
                value={(config.visibility as string) || 'internal'}
                onValueChange={(v) => onUpdateConfig('visibility', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="customer_visible">Customer Visible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Call Webhook */}
        {!isTrigger && node.actionType === 'call_webhook' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">URL (HTTPS preferred)</Label>
              <Input
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="https://example.com/webhook"
                value={(config.url as string) || ''}
                onChange={(e) => onUpdateConfig('url', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Method</Label>
              <Select
                value={(config.method as string) || 'POST'}
                onValueChange={(v) => onUpdateConfig('method', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Payload (JSON)</Label>
              <Textarea
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder='{"event": "booking"}'
                value={(config.body_template as string) || ''}
                onChange={(e) => onUpdateConfig('body_template', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Timeout (seconds)</Label>
              <Input
                type="number"
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                value={(config.timeout_seconds as number) || 10}
                onChange={(e) => onUpdateConfig('timeout_seconds', parseInt(e.target.value) || 10)}
              />
            </div>
            <p className="text-[10px] text-[#94A3B8]/60">
              Private networks, localhost, and metadata endpoints are blocked.
            </p>
          </div>
        )}

        {/* In-App Notification */}
        {!isTrigger && node.actionType === 'create_in_app_notification' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Title</Label>
              <Input
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="Notification title"
                value={(config.title as string) || ''}
                onChange={(e) => onUpdateConfig('title', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Message</Label>
              <Textarea
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="Message body"
                value={(config.message as string) || ''}
                onChange={(e) => onUpdateConfig('message', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Priority</Label>
              <Select
                value={(config.priority as string) || 'normal'}
                onValueChange={(v) => onUpdateConfig('priority', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Stop */}
        {!isTrigger && node.actionType === 'stop_workflow' && (
          <div>
            <Label className="text-xs text-[#94A3B8]">Reason (optional)</Label>
            <Input
              className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
              placeholder="Why this workflow stops"
              value={(config.reason as string) || ''}
              onChange={(e) => onUpdateConfig('reason', e.target.value)}
            />
            <p className="mt-2 text-xs text-[#94A3B8]/60">
              Stops the workflow execution at this point.
            </p>
          </div>
        )}

        {/* Create Task */}
        {!isTrigger && node.actionType === 'create_task' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Title</Label>
              <Input
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="Task title"
                value={(config.title as string) || ''}
                onChange={(e) => onUpdateConfig('title', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Description</Label>
              <Textarea
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="Task description..."
                value={(config.description as string) || ''}
                onChange={(e) => onUpdateConfig('description', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Due</Label>
              <Select
                value={(config.due_rule as string) || 'immediately'}
                onValueChange={(v) => onUpdateConfig('due_rule', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediately">Immediately</SelectItem>
                  <SelectItem value="24h_before">24h before</SelectItem>
                  <SelectItem value="48h_before">48h before</SelectItem>
                  <SelectItem value="on_completion">On completion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Priority</Label>
              <Select
                value={(config.priority as string) || 'normal'}
                onValueChange={(v) => onUpdateConfig('priority', v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Create Captain Session */}
        {!isTrigger && node.actionType === 'create_captain_session' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Captain Name (optional)</Label>
              <Input
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="Auto-assigned if empty"
                value={(config.captain_name as string) || ''}
                onChange={(e) => onUpdateConfig('captain_name', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Captain Email</Label>
              <Input
                type="email"
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="captain@example.com"
                value={(config.captain_email as string) || ''}
                onChange={(e) => onUpdateConfig('captain_email', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Captain Phone (optional)</Label>
              <Input
                type="tel"
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                placeholder="+1 555 123 4567"
                value={(config.captain_phone as string) || ''}
                onChange={(e) => onUpdateConfig('captain_phone', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Link Expiry (hours)</Label>
              <Input
                type="number"
                className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white"
                value={(config.expires_hours as number) || 48}
                onChange={(e) => onUpdateConfig('expires_hours', parseInt(e.target.value) || 48)}
              />
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#202A40] p-3">
              <p className="text-xs text-[#94A3B8]">
                Use <span className="font-mono text-[#06B6D4]">{'{{ captain.url }}'}</span> in the next email/SMS body.
                Set recipient to <span className="font-mono text-[#06B6D4]">{'{{ captain.email }}'}</span> or <span className="font-mono text-[#06B6D4]">{'{{ captain.phone }}'}</span> so it goes directly to the captain.
              </p>
            </div>
          </div>
        )}

        {/* Update Opportunity Stage */}
        {!isTrigger && node.actionType === 'update_opportunity_stage' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94A3B8]">Pipeline</Label>
              <Select
                value={(config.pipeline_id as string) || NONE_VALUE}
                onValueChange={(v) => {
                  onUpdateConfig('pipeline_id', v === NONE_VALUE ? undefined : v);
                  onUpdateConfig('stage_id', undefined);
                }}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-[#94A3B8]">Stage</Label>
              <Select
                value={(config.stage_id as string) || NONE_VALUE}
                onValueChange={(v) => onUpdateConfig('stage_id', v === NONE_VALUE ? undefined : v)}
              >
                <SelectTrigger className="mt-1.5 operan-config-input border-white/[0.08] bg-[#202A40] text-sm text-white">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {stages
                    .filter((s) => !config.pipeline_id || s.pipeline_id === config.pipeline_id)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
