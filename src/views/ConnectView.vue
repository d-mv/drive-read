<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useImportFiles } from '@/app/useImportFiles'

/** First run (canvas: "First run, connect Drive"). Drive arrives with build step 4. */
const router = useRouter()
const { busy, message, pick } = useImportFiles()
const driveNote = ref(false)

async function openFile() {
  const result = await pick()
  const first = result?.added[0]
  if (first) await router.push({ name: 'reader', params: { id: first.id } })
}
</script>

<template>
  <main
    class="mx-auto flex min-h-full max-w-[480px] flex-col px-6 pt-[72px] pb-9 text-base leading-[1.45]"
  >
    <div class="font-mono text-xs tracking-[0.08em] text-ink2 uppercase">Drive Read</div>

    <h1 class="mt-14 text-4xl leading-[1.1] font-medium tracking-[-0.02em] text-balance">
      Read the books in your Google Drive
    </h1>

    <ol class="mt-10 flex list-none flex-col p-0">
      <li
        v-for="(step, i) in [
          'Choose books or a whole folder in Drive.',
          'Books you open are kept on this device, so they work offline.',
          'Your place is saved to Drive and follows you to your other devices.',
        ]"
        :key="i"
        class="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-rule py-3.5 last:border-b"
      >
        <span class="font-mono text-[13px] leading-[23px] text-ink2">{{
          String(i + 1).padStart(2, '0')
        }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>

    <div class="mt-auto flex flex-col gap-2 pt-10">
      <button
        type="button"
        class="h-[52px] rounded-ctl bg-ink text-base font-medium text-paper"
        :aria-describedby="driveNote ? 'drive-note' : undefined"
        @click="driveNote = true"
      >
        Connect Google Drive
      </button>
      <p v-if="driveNote" id="drive-note" role="status" class="text-center text-[13px] text-ink2">
        Google Drive isn't connected in this version yet. Open a file from this device instead.
      </p>
      <button
        type="button"
        class="h-12 text-[15px] underline underline-offset-[3px] disabled:opacity-50"
        :disabled="busy"
        @click="openFile"
      >
        {{ busy ? 'Opening…' : 'Open a file from this device' }}
      </button>
      <p v-if="message" role="alert" class="text-center text-[13px] text-signal">{{ message }}</p>
      <p class="mt-2 text-center text-[13px] text-ink2">
        EPUB for now, PDF later. Files with DRM will not open.
      </p>
    </div>
  </main>
</template>
