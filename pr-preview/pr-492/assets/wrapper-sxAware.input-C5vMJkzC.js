import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-Cm7jiOZ_.js";import{s as r}from"./helpers-BXSe11mF.js";import{t as i}from"./sx-aware-component-DXhKEhyN.js";import{a,i as o,n as s,r as c,t as l}from"./sx-aware-text-CWLcPl-p.js";n();var u=e(),d=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,f=t(i)`
  @media print {
    display: block;
  }
`,p=t(a)`
  @media print {
    display: block;
  }
`,m=t(o)`
  @media print {
    display: block;
  }
`,h=t(i)`
  @media print {
    display: ${e=>e.printDisplay};
  }
`,g=t(i)`
  &:hover {
    @media (hover: hover) {
      background-color: orange;
    }
  }
`,_=t(i)`
  color: white;
`,v=t(i)`
  background-color: #fef3c7;
`,y=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,b=t(i)`
  color: red;
`,x=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,S=t(i)`
  color: #14532d;
  ${r(!0)};
`,C=t(c)`
  color: navy;
  line-height: 20px;
`,w=t(c)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,T=t(l)`
  margin-left: 4px;
  color: #2563eb;
`,E=t(s)`
  align-items: center;
  min-width: 24px;
`,D=t(i)`
  border-color: #c084fc;
`,O=t(D)`
  background-color: #f5f3ff;
`,k=t(D)`
  color: #4c1d95;
`,A=t(D)`
  color: #6d28d9;
`,j=t(D)`
  color: #7c3aed;
`,M=t(D)`
  color: #9333ea;
`,N=t(D)`
  color: #a855f7;
`,P=t(D)`
  color: #c084fc;
`,F=t(D)`
  color: #d8b4fe;
`,I=t(D)`
  color: #e9d5ff;
`,L=t(D)`
  color: #f3e8ff;
`,R=t(D)`
  color: #581c87;
`,z={caller:{kMnn75:`xujl8zx`,$$css:!0}},B={"--column-width":`96px`,display:`flex`,gap:8,padding:8},V=()=>(0,u.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,u.jsx)(d,{children:`Default`}),(0,u.jsx)(d,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,u.jsx)(d,{sx:z.caller,children:`Caller sx`}),(0,u.jsx)(f,{children:`Print display`}),(0,u.jsx)(p,{children:`Default export print`}),(0,u.jsx)(m,{children:`Directory import print`}),(0,u.jsx)(h,{printDisplay:`block`,children:`Dynamic print display`}),(0,u.jsx)(g,{children:`Hover media`}),(0,u.jsx)(_,{children:`Primary 1`}),(0,u.jsx)(_,{children:`Primary 2`}),(0,u.jsx)(v,{sx:z.caller,children:`Inlined with caller sx`}),(0,u.jsx)(y,{active:!0,children:`Active forwarded`}),(0,u.jsx)(y,{children:`Inactive forwarded`}),(0,u.jsx)(b,{children:`Exported`}),(0,u.jsx)(b,{sx:z.caller,children:`Exported with caller sx`}),(0,u.jsx)(x,{$open:!0,sx:z.caller,children:`Exported toggle`}),(0,u.jsx)(S,{sx:z.caller,children:`Draggable sx`}),(0,u.jsx)(C,{size:`md`,children:`Generic Text`}),(0,u.jsx)(T,{color:`currentColor`,"aria-label":`Imported icon`}),(0,u.jsx)(E,{delay:100,children:`Imported tooltip`}),(0,u.jsx)(O,{sx:z.caller,children:`Interface wrapper`}),(0,u.jsx)(A,{sx:z.caller,children:`Imported type wrapper`}),(0,u.jsx)(j,{sx:z.caller,children:`Imported interface wrapper`}),(0,u.jsx)(M,{sx:z.caller,children:`Namespace type wrapper`}),(0,u.jsx)(N,{sx:z.caller,children:`Namespace interface wrapper`}),(0,u.jsx)(P,{sx:z.caller,children:`Barrel type wrapper`}),(0,u.jsx)(F,{sx:z.caller,children:`Default imported type wrapper`}),(0,u.jsx)(I,{sx:z.caller,children:`Default barrel type wrapper`}),(0,u.jsx)(L,{sx:z.caller,children:`Local default type wrapper`}),(0,u.jsx)(k,{sx:z.caller,children:`Explicit wrapper`}),(0,u.jsx)(R,{children:`Omit sx wrapper`}),(0,u.jsxs)(`div`,{style:B,children:[(0,u.jsx)(w,{color:`labelMuted`,children:`ABC-123`}),(0,u.jsx)(`span`,{children:`Item title`})]})]});export{V as App,S as DraggableSxButton,b as ExportedAccentButton,x as ExportedToggleButton};