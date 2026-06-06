import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-BNN2DC9L.js";/* empty css                          */var n=e(),r=t.button`
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-secondary);
  border-radius: var(--border-radius);

  &:hover {
    background: var(--color-secondary);
  }
`,i=t.div`
  padding: var(--spacing-lg);
  border: 1px solid var(--color-secondary, #ccc);
  border-radius: var(--border-radius);
  margin: var(--spacing-md);
`,a=t.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`,o=t.span`
  color: var(--color-primary, "tomato");
  background: ${e=>`var(--color-secondary, ${e.$tone})`};
  outline: 2px solid ${e=>`var(--color-secondary)`};
`,s=()=>(0,n.jsxs)(i,{children:[(0,n.jsx)(a,{children:`Some text content`}),(0,n.jsx)(r,{children:`Click me`}),(0,n.jsx)(o,{$tone:`papayawhip`,children:`Tagged`})]});export{s as App};