<template>
  <div class="home">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Welcome to Vue 3</h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        This is a starter template with Tailwind CSS, TypeScript, and Lucide icons
      </p>
    </div>

    <div class="grid md:grid-cols-3 gap-6 mb-12">
      <div class="bg-white rounded-lg shadow-sm border p-6">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
          <Rocket :size="24" class="text-green-600" />
        </div>
        <h3 class="text-xl font-semibold mb-2">Fast Development</h3>
        <p class="text-gray-600">Vue 3 with Vite for lightning-fast development experience</p>
      </div>

      <div class="bg-white rounded-lg shadow-sm border p-6">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
          <Code2 :size="24" class="text-green-600" />
        </div>
        <h3 class="text-xl font-semibold mb-2">TypeScript Support</h3>
        <p class="text-gray-600">Full TypeScript support with type checking and IntelliSense</p>
      </div>

      <div class="bg-white rounded-lg shadow-sm border p-6">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
          <Palette :size="24" class="text-green-600" />
        </div>
        <h3 class="text-xl font-semibold mb-2">Modern Styling</h3>
        <p class="text-gray-600">Tailwind CSS for utility-first styling approach</p>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow-sm border p-8 max-w-md mx-auto">
      <h2 class="text-2xl font-semibold mb-6 text-center">Vuex Counter Example</h2>
      <div class="text-center space-y-4">
        <p class="text-3xl font-bold text-gray-900">Count: {{ count }}</p>
        <p class="text-xl text-gray-600">Double Count: {{ doubleCount }}</p>
        <div class="flex justify-center gap-3">
          <button 
            @click="decrement"
            class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            <Minus :size="20" />
          </button>
          <button 
            @click="increment"
            class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            <Plus :size="20" />
          </button>
          <button 
            @click="incrementAsync"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <Timer :size="20" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useStore } from 'vuex';
import { Rocket, Code2, Palette, Plus, Minus, Timer } from 'lucide-vue-next';

export default defineComponent({
  name: 'HomeView',
  components: {
    Rocket,
    Code2,
    Palette,
    Plus,
    Minus,
    Timer
  },
  setup() {
    const store = useStore();

    const count = computed(() => store.state.count);
    const doubleCount = computed(() => store.getters.doubleCount);

    const increment = () => store.commit('increment');
    const decrement = () => store.commit('decrement');
    const incrementAsync = () => store.dispatch('incrementAsync');

    return {
      count,
      doubleCount,
      increment,
      decrement,
      incrementAsync
    };
  }
});
</script>