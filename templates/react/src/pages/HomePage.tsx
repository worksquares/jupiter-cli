import React from 'react';
import { Button } from '../components/ui/button';
import { Rocket, Code2, Palette } from 'lucide-react';

const HomePage: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Welcome to React</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          This is a starter template for your React application with Tailwind CSS,
          shadcn/ui components, and Lucide icons.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <div className="border rounded-lg p-6 space-y-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Fast Development</h3>
          <p className="text-muted-foreground">
            Get started quickly with pre-configured tools and modern best practices.
          </p>
        </div>

        <div className="border rounded-lg p-6 space-y-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Code2 className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">TypeScript Ready</h3>
          <p className="text-muted-foreground">
            Full TypeScript support for type-safe development and better IDE experience.
          </p>
        </div>

        <div className="border rounded-lg p-6 space-y-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Palette className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">Beautiful UI</h3>
          <p className="text-muted-foreground">
            Tailwind CSS and shadcn/ui components for stunning, accessible interfaces.
          </p>
        </div>
      </div>

      <div className="flex justify-center gap-4 mt-12">
        <Button>Get Started</Button>
        <Button variant="outline">Learn More</Button>
      </div>
    </div>
  );
};

export default HomePage;