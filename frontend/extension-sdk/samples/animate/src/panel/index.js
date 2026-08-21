/**
 * What the panel frame paints.
 *
 * `mount` is the whole contract between the SDK and a document: the SDK ships no
 * framework, so it calls this and nothing else. `defineSlot` writes that `mount`
 * for a Vue component, and the function it returns unmounts the app when the
 * frame goes away.
 */

import { defineSlot } from "frappe-builder-extension-sdk/vue";
import AnimatePanel from "./AnimatePanel.vue";

export const { mount } = defineSlot(AnimatePanel);
