import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BGDIFsE0.js";import{s as r}from"./helpers-bYM2erov.js";import{t as i}from"./sx-aware-component-DUB4r15n.js";import{n as a,r as o,t as s}from"./sx-aware-text-CBOqFSp1.js";import{i as c,n as l,r as u,t as d}from"./sx-branchy-box-DC2aGXSa.js";t();var f=e(),p=n(i)`
  color: #bf4f74;
  font-weight: bold;
`,m=n(i)`
  @media print {
    display: block;
  }
`,h=n(c)`
  @media print {
    display: block;
  }
`,g=n(u)`
  @media print {
    display: block;
  }
`,_=n(l)`
  @media print {
    display: block;
  }
`,v=n(i)`
  @media print {
    display: ${e=>e.printDisplay};
  }
`,y=n(i)`
  &:hover {
    @media (hover: hover) {
      background-color: orange;
    }
  }
`,b=n(d)`
  @media print {
    display: block;
  }
`,x=n(i)`
  color: white;
`,S=n(i)`
  background-color: #fef3c7;
`,C=n(i)`
  color: ${e=>e.active?`green`:`gray`};
`,w=n(i)`
  color: red;
`,T=n(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,E=n(i)`
  color: #14532d;
  ${r(!0)};
`,D=n(o)`
  color: navy;
  line-height: 20px;
`,O=n(o)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,k=n(s)`
  margin-left: 4px;
  color: #2563eb;
`,A=n(a)`
  align-items: center;
  min-width: 24px;
`,j=n(i)`
  border-color: #c084fc;
`,M=n(j)`
  background-color: #f5f3ff;
`,N=n(j)`
  color: #4c1d95;
`,P=n(j)`
  color: #6d28d9;
`,F=n(j)`
  color: #7c3aed;
`,I=n(j)`
  color: #9333ea;
`,L=n(j)`
  color: #a855f7;
`,R=n(j)`
  color: #c084fc;
`,z=n(j)`
  color: #d8b4fe;
`,B=n(j)`
  color: #e9d5ff;
`,V=n(j)`
  color: #f3e8ff;
`,H=n(j)`
  color: #581c87;
`,U={caller:{kMnn75:`xujl8zx`,$$css:!0}},W={"--column-width":`96px`,display:`flex`,gap:8,padding:8},G=()=>(0,f.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,f.jsx)(p,{children:`Default`}),(0,f.jsx)(p,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,f.jsx)(p,{sx:U.caller,children:`Caller sx`}),(0,f.jsx)(m,{children:`Print display`}),(0,f.jsx)(h,{children:`Default export print`}),(0,f.jsx)(g,{children:`Default identifier print`}),(0,f.jsx)(_,{children:`Directory import print`}),(0,f.jsx)(v,{printDisplay:`block`,children:`Dynamic print display`}),(0,f.jsx)(y,{children:`Hover media`}),(0,f.jsx)(b,{children:`Nested sx scope`}),(0,f.jsx)(x,{children:`Primary 1`}),(0,f.jsx)(x,{children:`Primary 2`}),(0,f.jsx)(S,{sx:U.caller,children:`Inlined with caller sx`}),(0,f.jsx)(C,{active:!0,children:`Active forwarded`}),(0,f.jsx)(C,{children:`Inactive forwarded`}),(0,f.jsx)(w,{children:`Exported`}),(0,f.jsx)(w,{sx:U.caller,children:`Exported with caller sx`}),(0,f.jsx)(T,{$open:!0,sx:U.caller,children:`Exported toggle`}),(0,f.jsx)(E,{sx:U.caller,children:`Draggable sx`}),(0,f.jsx)(D,{size:`md`,children:`Generic Text`}),(0,f.jsx)(k,{color:`currentColor`,"aria-label":`Imported icon`}),(0,f.jsx)(A,{delay:100,children:`Imported tooltip`}),(0,f.jsx)(M,{sx:U.caller,children:`Interface wrapper`}),(0,f.jsx)(P,{sx:U.caller,children:`Imported type wrapper`}),(0,f.jsx)(F,{sx:U.caller,children:`Imported interface wrapper`}),(0,f.jsx)(I,{sx:U.caller,children:`Namespace type wrapper`}),(0,f.jsx)(L,{sx:U.caller,children:`Namespace interface wrapper`}),(0,f.jsx)(R,{sx:U.caller,children:`Barrel type wrapper`}),(0,f.jsx)(z,{sx:U.caller,children:`Default imported type wrapper`}),(0,f.jsx)(B,{sx:U.caller,children:`Default barrel type wrapper`}),(0,f.jsx)(V,{sx:U.caller,children:`Local default type wrapper`}),(0,f.jsx)(N,{sx:U.caller,children:`Explicit wrapper`}),(0,f.jsx)(H,{children:`Omit sx wrapper`}),(0,f.jsxs)(`div`,{style:W,children:[(0,f.jsx)(O,{color:`labelMuted`,children:`ABC-123`}),(0,f.jsx)(`span`,{children:`Item title`})]})]});export{G as App,E as DraggableSxButton,w as ExportedAccentButton,T as ExportedToggleButton};