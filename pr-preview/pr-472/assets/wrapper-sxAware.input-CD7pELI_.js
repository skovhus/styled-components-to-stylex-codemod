import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-ATiVa8BI.js";import{s as r}from"./helpers-RhdFsgWC.js";import{t as i}from"./sx-aware-component-RzzvIKFt.js";import{n as a,r as o,t as s}from"./sx-aware-text-W0Cco_NE.js";n();var c=e(),l=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,u=t(i)`
  color: white;
`,d=t(i)`
  background-color: #fef3c7;
`,f=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,p=t(i)`
  color: red;
`,m=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,h=t(i)`
  color: #14532d;
  ${r(!0)};
`,g=t(o)`
  color: navy;
  line-height: 20px;
`,_=t(o)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,v=t(s)`
  margin-left: 4px;
  color: #2563eb;
`,y=t(a)`
  align-items: center;
  min-width: 24px;
`,b={caller:{kMnn75:`xujl8zx`,$$css:!0}},x={"--column-width":`96px`,display:`flex`,gap:8,padding:8},S=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,c.jsx)(l,{children:`Default`}),(0,c.jsx)(l,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,c.jsx)(l,{sx:b.caller,children:`Caller sx`}),(0,c.jsx)(u,{children:`Primary 1`}),(0,c.jsx)(u,{children:`Primary 2`}),(0,c.jsx)(d,{sx:b.caller,children:`Inlined with caller sx`}),(0,c.jsx)(f,{active:!0,children:`Active forwarded`}),(0,c.jsx)(f,{children:`Inactive forwarded`}),(0,c.jsx)(p,{children:`Exported`}),(0,c.jsx)(p,{sx:b.caller,children:`Exported with caller sx`}),(0,c.jsx)(m,{$open:!0,sx:b.caller,children:`Exported toggle`}),(0,c.jsx)(h,{sx:b.caller,children:`Draggable sx`}),(0,c.jsx)(g,{size:`md`,children:`Generic Text`}),(0,c.jsx)(v,{color:`currentColor`,"aria-label":`Imported icon`}),(0,c.jsx)(y,{delay:100,children:`Imported tooltip`}),(0,c.jsxs)(`div`,{style:x,children:[(0,c.jsx)(_,{color:`labelMuted`,children:`ABC-123`}),(0,c.jsx)(`span`,{children:`Item title`})]})]});export{S as App,h as DraggableSxButton,p as ExportedAccentButton,m as ExportedToggleButton};