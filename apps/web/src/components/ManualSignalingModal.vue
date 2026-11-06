<script setup lang="ts">
import { ref } from "vue";
import { useNetworkStore } from "../stores/network";
import { useIdentityStore } from "../stores/identity";
import { Button } from "@campusmesh/ui";
import { Radio, X, Copy, Check, ArrowRight, ArrowLeft } from "lucide-vue-next";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const networkStore = useNetworkStore();
const identityStore = useIdentityStore();

const mode = ref<"choose" | "offer" | "answer">("choose");
const targetFingerprint = ref("");
const generatedOffer = ref("");
const offerInput = ref("");
const generatedAnswer = ref("");
const answerInput = ref("");
const isCopiedOffer = ref(false);
const isCopiedAnswer = ref(false);
const errorMsg = ref<string | null>(null);
const successMsg = ref<string | null>(null);
const isProcessing = ref(false);

async function handleGenerateOffer() {
  errorMsg.value = null;
  if (!targetFingerprint.value.trim()) {
    errorMsg.value = "Please enter the recipient's fingerprint.";
    return;
  }
  const myFp = identityStore.identity?.fingerprint;
  if (!myFp) {
    errorMsg.value = "Identity not initialized.";
    return;
  }

  isProcessing.value = true;
  try {
    generatedOffer.value = await networkStore.createManualOffer(
      targetFingerprint.value.trim(),
      myFp,
    );
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    isProcessing.value = false;
  }
}

async function handleAcceptAnswer() {
  errorMsg.value = null;
  if (!answerInput.value.trim()) {
    errorMsg.value = "Please paste the generated answer string.";
    return;
  }
  isProcessing.value = true;
  try {
    await networkStore.acceptManualAnswer(answerInput.value.trim());
    successMsg.value = "P2P Connection Established!";
    setTimeout(() => emit("close"), 2000);
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    isProcessing.value = false;
  }
}

async function handleProcessOffer() {
  errorMsg.value = null;
  if (!offerInput.value.trim()) {
    errorMsg.value = "Please paste the offer string you received.";
    return;
  }
  const myFp = identityStore.identity?.fingerprint;
  if (!myFp) {
    errorMsg.value = "Identity not initialized.";
    return;
  }

  isProcessing.value = true;
  try {
    const res = await networkStore.acceptManualOffer(
      offerInput.value.trim(),
      myFp,
    );
    generatedAnswer.value = res.answerString;
    targetFingerprint.value = res.senderFingerprint;
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : String(err);
  } finally {
    isProcessing.value = false;
  }
}

function copyOffer() {
  if (generatedOffer.value) {
    navigator.clipboard.writeText(generatedOffer.value);
    isCopiedOffer.value = true;
    setTimeout(() => {
      isCopiedOffer.value = false;
    }, 2000);
  }
}

function copyAnswer() {
  if (generatedAnswer.value) {
    navigator.clipboard.writeText(generatedAnswer.value);
    isCopiedAnswer.value = true;
    setTimeout(() => {
      isCopiedAnswer.value = false;
    }, 2000);
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
  >
    <div
      class="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200"
    >
      <div
        class="flex items-center justify-between pb-3 border-b border-border"
      >
        <div class="flex items-center gap-2">
          <Radio class="h-5 w-5 text-primary" />
          <h2 class="text-base font-bold text-textPrimary">
            Manual P2P Connection (Offline / Air-Gapped)
          </h2>
        </div>
        <button
          class="text-textSecondary hover:text-textPrimary p-1 rounded-md"
          @click="emit('close')"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Mode Choice -->
      <div v-if="mode === 'choose'" class="space-y-4">
        <p class="text-xs text-textSecondary">
          Connect directly via WebRTC DataChannels when signaling servers are
          offline or quota-limited. Choose your role:
        </p>

        <div class="grid grid-cols-2 gap-3 pt-2">
          <button
            class="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-surface-subtle hover:bg-surface-hover transition-colors text-center space-y-2"
            @click="mode = 'offer'"
          >
            <div class="p-2.5 rounded-full bg-primary/10 text-primary">
              <ArrowRight class="h-5 w-5" />
            </div>
            <span class="text-xs font-bold text-textPrimary"
              >Initiate Connection</span
            >
            <span class="text-[11px] text-textSecondary"
              >Create and send an offer code</span
            >
          </button>

          <button
            class="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-surface-subtle hover:bg-surface-hover transition-colors text-center space-y-2"
            @click="mode = 'answer'"
          >
            <div
              class="p-2.5 rounded-full bg-secondary text-secondary-foreground"
            >
              <ArrowLeft class="h-5 w-5" />
            </div>
            <span class="text-xs font-bold text-textPrimary"
              >Accept Connection</span
            >
            <span class="text-[11px] text-textSecondary"
              >Paste an offer code & reply</span
            >
          </button>
        </div>
      </div>

      <!-- INITIATE (OFFER) MODE -->
      <div v-else-if="mode === 'offer'" class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-textSecondary"
            >Step 1: Create Offer</span
          >
          <button
            class="text-xs text-primary hover:underline"
            @click="mode = 'choose'"
          >
            Back
          </button>
        </div>

        <div v-if="!generatedOffer" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1.5"
              >Peer Fingerprint</label
            >
            <input
              v-model="targetFingerprint"
              placeholder="Paste recipient's safety fingerprint..."
              class="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
          </div>
          <Button
            class="w-full"
            :disabled="isProcessing"
            @click="handleGenerateOffer"
          >
            {{
              isProcessing
                ? "Generating Offer..."
                : "Generate Connection String"
            }}
          </Button>
        </div>

        <div v-else class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-textSecondary mb-1">
              Share this code with your peer:
            </label>
            <textarea
              readonly
              :value="generatedOffer"
              rows="3"
              class="w-full rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs font-mono text-textPrimary select-all"
            />
            <Button
              variant="outline"
              size="sm"
              class="w-full mt-2 gap-1.5"
              @click="copyOffer"
            >
              <Check v-if="isCopiedOffer" class="h-3.5 w-3.5 text-success" />
              <Copy v-else class="h-3.5 w-3.5" />
              <span>{{ isCopiedOffer ? "Copied" : "Copy Offer Code" }}</span>
            </Button>
          </div>

          <div class="pt-2 border-t border-border">
            <label class="block text-xs font-medium text-textSecondary mb-1.5">
              Step 2: Paste Answer from Peer
            </label>
            <textarea
              v-model="answerInput"
              rows="2"
              placeholder="Paste the answer code sent back by peer..."
              class="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs font-mono text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              class="w-full mt-2"
              :disabled="isProcessing"
              @click="handleAcceptAnswer"
            >
              {{ isProcessing ? "Connecting..." : "Complete P2P Connection" }}
            </Button>
          </div>
        </div>
      </div>

      <!-- ACCEPT (ANSWER) MODE -->
      <div v-else-if="mode === 'answer'" class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-textSecondary"
            >Step 1: Paste Received Offer</span
          >
          <button
            class="text-xs text-primary hover:underline"
            @click="mode = 'choose'"
          >
            Back
          </button>
        </div>

        <div v-if="!generatedAnswer" class="space-y-3">
          <textarea
            v-model="offerInput"
            rows="3"
            placeholder="Paste CM45:... offer string here"
            class="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs font-mono text-textPrimary placeholder:text-textSecondary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button
            class="w-full"
            :disabled="isProcessing"
            @click="handleProcessOffer"
          >
            {{ isProcessing ? "Generating Answer..." : "Generate Answer Code" }}
          </Button>
        </div>

        <div v-else class="space-y-3">
          <label class="block text-xs font-medium text-textSecondary mb-1">
            Send this answer back to the peer:
          </label>
          <textarea
            readonly
            :value="generatedAnswer"
            rows="3"
            class="w-full rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs font-mono text-textPrimary select-all"
          />
          <Button
            variant="outline"
            size="sm"
            class="w-full gap-1.5"
            @click="copyAnswer"
          >
            <Check v-if="isCopiedAnswer" class="h-3.5 w-3.5 text-success" />
            <Copy v-else class="h-3.5 w-3.5" />
            <span>{{ isCopiedAnswer ? "Copied" : "Copy Answer Code" }}</span>
          </Button>

          <Button class="w-full mt-2" @click="emit('close')">Done</Button>
        </div>
      </div>

      <div
        v-if="errorMsg"
        class="p-3 text-xs rounded-lg bg-danger/10 border border-danger/20 text-danger"
      >
        {{ errorMsg }}
      </div>
      <div
        v-if="successMsg"
        class="p-3 text-xs rounded-lg bg-success/10 border border-success/20 text-success font-medium"
      >
        {{ successMsg }}
      </div>
    </div>
  </div>
</template>
