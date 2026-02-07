import{j as r,d as o}from"./index-B-YTonrH.js";/* empty css                          */const a=o.button`
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-secondary);
  border-radius: var(--border-radius);

  &:hover {
    background: var(--color-secondary);
  }
`,d=o.div`
  padding: var(--spacing-lg);
  border: 1px solid var(--color-secondary, #ccc);
  border-radius: var(--border-radius);
  margin: var(--spacing-md);
`,i=o.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`,n=()=>r.jsxs(d,{children:[r.jsx(i,{children:"Some text content"}),r.jsx(a,{children:"Click me"})]});export{n as App};
