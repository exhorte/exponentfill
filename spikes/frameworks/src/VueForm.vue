<script setup>
import { reactive } from "vue";
const f = reactive({ first: "", email: "", country: "", status: "", news: false, notes: "", lazy: "" });
</script>

<template>
  <form @submit.prevent>
    <h1>Vue 3 (v-model)</h1>
    <label for="first">First name</label>
    <input id="first" name="first" type="text" v-model="f.first" />
    <label for="email">Email</label>
    <input id="email" name="email" type="email" v-model="f.email" />
    <label for="country">Country</label>
    <select id="country" name="country" v-model="f.country">
      <option value="">Choose…</option><option value="FR">France</option><option value="SN">Senegal</option>
    </select>
    <fieldset>
      <legend>Status</legend>
      <label><input type="radio" name="status" value="employed" v-model="f.status" /> employed</label>
      <label><input type="radio" name="status" value="student" v-model="f.status" /> student</label>
    </fieldset>
    <label><input type="checkbox" name="news" v-model="f.news" /> Newsletter</label>
    <label for="notes">Notes</label>
    <textarea id="notes" name="notes" rows="3" v-model="f.notes"></textarea>
    <label for="lazy">Lazy field (v-model.lazy: updates on change, NOT on input)</label>
    <input id="lazy" name="lazy" type="text" v-model.lazy="f.lazy" />
    <h2>Framework state</h2>
    <pre id="state">{{ JSON.stringify(f) }}</pre>
  </form>
</template>
