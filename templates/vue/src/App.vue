<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-sm border-b">
      <div class="container mx-auto px-4 py-4 flex items-center gap-6">
        <router-link 
          to="/" 
          class="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors"
        >
          <Home :size="20" />
          Home
        </router-link>
        <router-link 
          to="/about"
          class="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors"
        >
          <Info :size="20" />
          About
        </router-link>
      </div>
    </nav>
    <main class="container mx-auto px-4 py-8">
      <router-view/>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { Home, Info } from 'lucide-vue-next';

export default defineComponent({
  name: 'App',
  components: {
    Home,
    Info
  }
});
</script>

<style>
.router-link-exact-active {
  @apply text-green-600;
}
</style>