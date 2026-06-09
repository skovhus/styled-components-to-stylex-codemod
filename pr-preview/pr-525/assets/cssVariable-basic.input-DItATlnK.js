import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-By22EWxe.js";/* empty css                          */n();var r=e(),i=t.button`
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-secondary);
  border-radius: var(--border-radius);

  &:hover {
    background: var(--color-secondary);
  }
`,a=t.div`
  padding: var(--spacing-lg);
  border: 1px solid var(--color-secondary, #ccc);
  border-radius: var(--border-radius);
  margin: var(--spacing-md);
`,o=t.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`,s=t.span`
  color: var(--color-primary, "tomato");
  background: ${e=>`var(--color-secondary, ${e.$tone})`};
  outline: 2px solid ${e=>`var(--color-secondary)`};
`,c=t.div`
  --agent-item-min-width: 100%;
`,l=t.div`
  --agent-item-min-width: 75%;
`,u=t.div`
  @media (min-width: 600px) {
    --agent-item-min-width: 75%;
  }
  &:hover {
    --agent-item-min-width: 80%;
  }
`,d=()=>(0,r.jsxs)(a,{children:[(0,r.jsx)(o,{children:`Some text content`}),(0,r.jsx)(i,{children:`Click me`}),(0,r.jsx)(s,{$tone:`papayawhip`,children:`Tagged`}),(0,r.jsx)(c,{children:(0,r.jsx)(s,{$tone:`mistyrose`,children:`Wide tagged`})}),(0,r.jsx)(c,{children:(0,r.jsx)(i,{children:`Wide button`})}),(0,r.jsx)(l,{children:(0,r.jsx)(i,{children:`Single-use wide button`})}),(0,r.jsx)(u,{children:(0,r.jsx)(i,{children:`Conditional wide button`})})]});export{d as App};