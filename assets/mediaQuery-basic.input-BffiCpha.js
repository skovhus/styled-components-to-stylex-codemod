import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DVlcDaUT.js";var n=e(),r=t.div`
  width: 100%;
  padding: 1.5rem;
  background: linear-gradient(135deg, #ffe4b5 0%, #ffd699 100%);
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (min-width: 768px) {
    width: 750px;
    margin: 0 auto;
    padding: 2rem;
    background: linear-gradient(135deg, #98fb98 0%, #90ee90 100%);
  }

  @media (min-width: 1024px) {
    width: 960px;
    padding: 2.5rem;
    background: linear-gradient(135deg, #87ceeb 0%, #add8e6 100%);
  }
`,i=t.h2`
  margin: 0 0 1rem;
  font-size: 1.5rem;
  color: #333;

  @media (min-width: 768px) {
    font-size: 2rem;
  }

  @media (min-width: 1024px) {
    font-size: 2.5rem;
  }
`,a=t.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }
`,o=t.div`
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    @media (hover: hover) {
      transform: translateY(-4px);
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
    }
  }
`,s=t.h3`
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #555;
`,c=t.p`
  margin: 0;
  font-size: 0.875rem;
  color: #777;
  line-height: 1.5;
`,l=t.button`
  display: block;
  width: 100%;
  margin-top: 1.5rem;
  padding: 12px 24px;
  background: linear-gradient(135deg, #4169e1 0%, #6495ed 100%);
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  @media (min-width: 768px) {
    width: auto;
  }

  &:hover {
    @media (hover: hover) {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(65, 105, 225, 0.4);
    }
  }

  &:active {
    transform: scale(0.95);
  }
`,u=()=>(0,n.jsxs)(r,{children:[(0,n.jsx)(i,{children:`Responsive Media Queries`}),(0,n.jsxs)(a,{children:[(0,n.jsxs)(o,{children:[(0,n.jsx)(s,{children:`Card One`}),(0,n.jsx)(c,{children:`Resize the window to see the layout change from 1 to 2 to 3 columns.`})]}),(0,n.jsxs)(o,{children:[(0,n.jsx)(s,{children:`Card Two`}),(0,n.jsx)(c,{children:`The background color also changes at different breakpoints.`})]}),(0,n.jsxs)(o,{children:[(0,n.jsx)(s,{children:`Card Three`}),(0,n.jsx)(c,{children:`Hover over cards to see the hover effect (on devices that support it).`})]})]}),(0,n.jsx)(l,{children:`Interactive Button`})]});export{u as App};