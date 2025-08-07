# AI-Powered Domain Generation

## Overview

The DomainConfigurationService uses CosmosAPI to generate memorable, brandable domain names based on project information. This creates unique and meaningful subdomains that reflect the project's purpose and target audience.

## How It Works

### 1. AI Generation Process

```typescript
// Request
{
  projectName: "Fashion Marketplace",
  projectDescription: "Modern e-commerce for trendy clothing",
  projectType: "webapp",
  targetAudience: "Young adults",
  keywords: ["fashion", "style", "trendy"],
  preferredStyle: "creative"
}

// AI Generated
{
  primary: "stylemart",
  alternatives: ["trendshop", "fashionly", "stylehub"],
  reasoning: "Combines 'style' and 'marketplace' for memorable branding",
  score: 0.92
}
```

### 2. Generation Styles

#### Professional
- Clean, corporate-friendly names
- Examples: `dataflow`, `syncpro`, `bizconnect`

#### Creative
- Unique, memorable combinations
- Examples: `pixelmagic`, `dreamify`, `sparknode`

#### Technical
- Developer-focused naming
- Examples: `apiforge`, `codestream`, `devhub`

#### Playful
- Fun, approachable names
- Examples: `happyapp`, `funflow`, `joybox`

## AI Prompt Engineering

### Template Structure

```javascript
const prompt = `
Generate a memorable subdomain name for:
- Project: ${projectName}
- Description: ${description}
- Type: ${projectType}
- Audience: ${targetAudience}
- Style: ${style}

Requirements:
1. 5-15 characters
2. Easy to spell and remember
3. URL-safe (lowercase, alphanumeric + hyphens)
4. Reflects project purpose
5. Unique with optional suffix

Return JSON:
{
  "primary": "suggested-name",
  "alternatives": ["alt1", "alt2", "alt3"],
  "reasoning": "Why this works"
}
`;
```

### AI Decision Factors

1. **Project Analysis**
   - Extracts key concepts from name/description
   - Identifies domain purpose
   - Considers target audience

2. **Creative Combination**
   - Merges relevant words
   - Creates portmanteaus
   - Applies style guidelines

3. **Validation**
   - Checks pronounceability
   - Ensures memorability
   - Validates uniqueness

## Implementation Examples

### E-commerce Site
```typescript
// Input
{
  projectName: "Artisan Crafts Store",
  keywords: ["handmade", "crafts", "artisan"],
  preferredStyle: "creative"
}

// AI Output
{
  primary: "craftopia",
  alternatives: ["artisanhub", "makemart", "craftyshop"],
  reasoning: "Combines 'craft' with 'utopia' suggesting an ideal place for crafts"
}
```

### SaaS API
```typescript
// Input
{
  projectName: "Real-time Analytics API",
  projectType: "api",
  preferredStyle: "technical"
}

// AI Output
{
  primary: "metricflow",
  alternatives: ["datastream", "analytix", "insightapi"],
  reasoning: "Technical name combining metrics and data flow concepts"
}
```

### Social Platform
```typescript
// Input
{
  projectName: "Community Forum",
  targetAudience: "Developers",
  preferredStyle: "professional"
}

// AI Output
{
  primary: "devforum",
  alternatives: ["codecomm", "techtalks", "devconnect"],
  reasoning: "Clear, professional name for developer community"
}
```

## Quality Scoring

Domains are scored on:

1. **Length** (40%)
   - Optimal: 6-12 characters
   - Penalty for too short/long

2. **Memorability** (30%)
   - No numbers: +10%
   - Pronounceable: +10%
   - Few hyphens: +10%

3. **Relevance** (30%)
   - Matches project purpose
   - Appropriate for audience
   - Reflects style preference

## Fallback Strategy

If AI generation fails:

1. **Algorithmic Generation**
   ```
   {projectName}-{type}-{randomSuffix}
   Example: fashionstore-web-x7k
   ```

2. **Reserved Alternatives**
   - Check similar available names
   - Apply variations (add/remove words)
   - Use type-specific prefixes

3. **Manual Override**
   - Allow custom domain input
   - Validate availability
   - Apply same uniqueness rules

## Best Practices

### DO:
- Provide detailed project descriptions
- Include relevant keywords
- Specify target audience
- Choose appropriate style

### DON'T:
- Use special characters
- Include personal information
- Copy existing brands
- Use offensive terms

## API Integration

### Generate Domain
```bash
POST /api/domains/generate
{
  "projectId": "proj-123",
  "projectName": "My Awesome App",
  "projectDescription": "Social platform for artists",
  "keywords": ["art", "social", "creative"],
  "preferredStyle": "creative"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "primary": "artconnect",
    "fqdn": "artconnect.digisquares.in",
    "alternatives": [
      {"subdomain": "creativehub", "fqdn": "creativehub.digisquares.in"},
      {"subdomain": "artisocial", "fqdn": "artisocial.digisquares.in"}
    ],
    "reasoning": "Combines art and connection themes",
    "score": 0.88
  }
}
```

## Database Schema

Domains are stored with:
- AI generation parameters
- Selected domain and alternatives
- Generation score
- User feedback (accepted/rejected/modified)
- Usage analytics

## Future Enhancements

1. **Multi-language Support**
   - Generate domains in different languages
   - Cultural appropriateness checks

2. **Brand Analysis**
   - Check trademark databases
   - Similarity to existing brands

3. **A/B Testing**
   - Track domain performance
   - Optimize generation algorithm

4. **User Preferences**
   - Learn from accepted/rejected domains
   - Personalized suggestions