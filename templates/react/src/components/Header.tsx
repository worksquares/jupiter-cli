import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Info } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="border-b">
      <nav className="container mx-auto px-4 py-4">
        <ul className="flex items-center gap-6">
          <li>
            <Link 
              to="/" 
              className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
          </li>
          <li>
            <Link 
              to="/about" 
              className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
            >
              <Info className="h-4 w-4" />
              About
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;