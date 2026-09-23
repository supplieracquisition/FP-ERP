import { ordersHelp } from "./orders";
import { importHelp } from "./import";
import { capacityHelp } from "./capacity";
import { poBuilderHelp } from "./po-builder";
import { productLibraryHelp } from "./product-library";
import { suppliersHelp } from "./suppliers";
import { apiKeysHelp } from "./api-keys";
import { teamHelp } from "./team";
import { activityHelp } from "./activity";

/**
 * One panel per tab, keyed by the tab it belongs to.
 *
 * Deliberately one file each rather than one shared write-up: the capacity
 * panel talks only about capacity, and every other panel talks only about its
 * own tab. A reader on Import should not have to skim orders or POs to find
 * their answer, and an edit to one tab's explanation should not be able to
 * disturb another's.
 *
 * What they DO share is the dialog and the typography, from
 * ../HowItWorksModal — chrome, not content.
 */
export const HELP_TOPICS = {
  orders: ordersHelp,
  import: importHelp,
  capacity: capacityHelp,
  "po-builder": poBuilderHelp,
  "product-library": productLibraryHelp,
  suppliers: suppliersHelp,
  "api-keys": apiKeysHelp,
  team: teamHelp,
  activity: activityHelp,
} as const;

export type HelpTopic = keyof typeof HELP_TOPICS;
