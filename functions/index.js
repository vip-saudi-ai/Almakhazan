'use strict';

// Cloud Functions entry point.
//
// Grouped by concern; each module owns its own authorization and never trusts a
// value the client supplied about identity, plan, or ownership.

const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 20 });

const ai = require('./src/ai');
const billing = require('./src/billing');
const media = require('./src/media');
const usage = require('./src/usage');
const workspaces = require('./src/workspaces');
const account = require('./src/account');

// ── AI ──
exports.analyzeInventoryItem = ai.analyzeInventoryItem;
exports.aiHealth = ai.aiHealth;

// ── usage and entitlements ──
exports.onItemWritten = usage.onItemWritten;
exports.onMediaWritten = usage.onMediaWritten;
exports.onMemberWritten = usage.onMemberWritten;
exports.recalculateUsage = usage.recalculateUsage;
exports.getWorkspaceStatus = usage.getWorkspaceStatus;

// ── media lifecycle ──
exports.onItemMediaChanged = media.onItemMediaChanged;
exports.sweepOrphanMedia = media.sweepOrphanMedia;
exports.reconcileMedia = media.reconcileMedia;

// ── workspaces, members, deletion ──
exports.createWorkspace = workspaces.createWorkspace;
exports.inviteMember = workspaces.inviteMember;
exports.acceptInvitation = workspaces.acceptInvitation;
exports.requestWorkspaceDeletion = workspaces.requestWorkspaceDeletion;
exports.cancelWorkspaceDeletion = workspaces.cancelWorkspaceDeletion;
exports.sweepDeletedWorkspaces = workspaces.sweepDeletedWorkspaces;

// ── account lifecycle ──
exports.accountDeletionStatus = account.accountDeletionStatus;
exports.deleteAccount = account.deleteAccount;
exports.leaveWorkspace = account.leaveWorkspace;
exports.transferWorkspaceOwnership = account.transferWorkspaceOwnership;

// ── billing ──
exports.createCheckoutSession = billing.createCheckoutSession;
exports.createPortalSession = billing.createPortalSession;
exports.cancelSubscription = billing.cancelSubscription;
exports.billingWebhook = billing.billingWebhook;
