import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-C_cuLbez.js";import{l as r}from"./helpers-DjbUliP6.js";import{t as i}from"./icon-CzfuvNAe.js";import{t as a}from"./sx-aware-component-jsCnrC-G.js";t();var o=e(),s={},c=e=>{let{column:t,center:n,focusIndex:r,...i}=e;return(0,o.jsx)(`div`,{"data-focus-index":r,...i})},l=e=>{let{focusIndex:t,otherAttribute:n,someAttribute:r,...i}=e;return(0,o.jsx)(`section`,{"data-focus-index":t,"data-other-attribute":n?`true`:`false`,"data-some-attribute":r?`true`:`false`,...i})},u=()=>void 0,d=n.input.attrs(e=>({type:`text`,size:e.$small?5:void 0}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${e=>e.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`,f=n(`input`).attrs(e=>({"data-1p-ignore":e.allowPMAutofill!==!0}))`
  height: 32px;
  padding: 8px;
  background: white;
`,p=n(c).attrs({column:!0,center:!0})`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${e=>+!e.loaded};
`,m=n(l).attrs({someAttribute:!0})`
  padding: 16px 16px;
  background-color: #f0f9ff;
`,h=n(l).attrs({someAttribute:!0})`
  padding: 12px;
  background-color: #ecfdf5;
`,g=n(l).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#1d4ed8`:`#64748b`};
`,_=n(l).attrs({someAttribute:!0})`
  padding: 10px;
  background-color: ${e=>e.tone===`success`?`#dcfce7`:`#dbeafe`};
`,v=n(l).attrs({someAttribute:!0})`
  padding: 14px;
  background-color: #fef3c7;
`,y=n(l)`
  color: ${e=>e.tone===`secondary`?`#7c2d12`:`#1e3a8a`};
`,b=n(l).attrs({someAttribute:!0})`
  padding: 6px;
  background-color: #fdf2f8;
`,x=n(l).attrs(e=>({tabIndex:e.focusIndex}))`
  color: #334155;
`,S=n(l).attrs({someAttribute:!0})`
  padding: 18px;
  background-color: #eef2ff;
`,C=n(l).attrs({otherAttribute:!0,someAttribute:!0})`
  padding: 20px;
  background-color: #f0fdf4;
`,w=n(l).attrs({someAttribute:!0})`
  padding: 22px;
  background-color: #fff7ed;
`,T=n(l).attrs({someAttribute:!0})`
  padding: 24px;
  background-color: #f8fafc;
`,E=n(l).attrs({someAttribute:!0})`
  padding: 25px;
  background-color: #f1f5f9;
`,D=n(l)`
  color: ${e=>e.$tone===`warm`?`#9f1239`:`#1d4ed8`};
`,O=n(l).attrs({onClick:u})`
  padding: 26px;
  background-color: #eff6ff;
`,k=n(l).attrs({someAttribute:!0})`
  color: ${e=>e.$active?`#0f766e`:`#475569`};
`,A=n(l)`
  background-color: ${e=>e.$active?`#ccfbf1`:`#f8fafc`};
`,j=n(c).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
`,M=n(c).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`,N=n(c).attrs(e=>({tabIndex:e.focusIndex??0}))`
  overflow-y: auto;
`,P=n.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow: auto;
`,F=n(c).attrs(e=>({column:e.column??!0}))`
  align-items: center;
`,I=n.span.attrs({style:{whiteSpace:`nowrap`}})`
  color: blue;
`,L=n.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:void 0}}))`
  display: flex;
  align-items: center;
`,R=n.div.attrs(e=>({style:{height:e.height}}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${r};
    outline-offset: 3px;
  }
`,z=n.div.attrs(e=>({style:{height:e.height}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`,B=n.div.attrs(e=>({style:{height:e.height??`16px`}}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`,V=n.div.attrs(e=>({style:{height:e.$height??1}}))`
  width: 100%;
  background-color: #94a3b8;
`,H=n.div.attrs(({$height:e})=>({style:{height:e?`${e}px`:`16px`}}))`
  width: 100%;
  background-color: #16a34a;
`;function U(e){let{className:t,height:n,style:r}=e;return(0,o.jsx)(V,{$height:n,className:t,style:r})}function W(e){let{children:t,className:n,size:r,style:i,variant:a}=e;return(0,o.jsx)(`button`,{className:n,"data-size":r,"data-variant":a,style:i,children:t})}var G=n(n(W).attrs({size:`small`,variant:`borderless`})`
  padding: 4px 8px;
`)`
  color: #4338ca;
  background-color: #e0e7ff;
`,K=n.span.attrs({style:{color:`#0f766e`}})`
  font-weight: 600;
`,q=`#7c3aed`,J=n.span.attrs(()=>({style:{color:q}}))`
  font-style: italic;
`,Y=n(i).attrs({size:14})`
  position: relative;
  left: -3px;
`,X=n(a).attrs({sx:s,type:`button`})`
  color: #2563eb;
`,Z=n.div.attrs({title:`Line1
Line2`})`
  padding: 8px;
  background-color: #fdf4ff;
`,Q=n.div.attrs({title:`Plain template`})`
  padding: 8px;
  background-color: #fff1f2;
`,$=()=>(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(d,{$small:!0,placeholder:`Small`}),(0,o.jsx)(d,{placeholder:`Normal`}),(0,o.jsx)(d,{$padding:`2em`,placeholder:`Padded`}),(0,o.jsx)(f,{placeholder:`Text input`}),(0,o.jsx)(p,{loaded:!1,children:`Content`}),(0,o.jsx)(m,{label:`section-label`,children:`Section content`}),(0,o.jsx)(h,{label:`imported-section-label`,children:`Imported section content`}),(0,o.jsx)(g,{$active:!0,children:`Highlighted section content`}),(0,o.jsx)(_,{tone:`success`,children:`Utility section content`}),(0,o.jsx)(v,{tone:`primary`,children:`Shared attrs section content`}),(0,o.jsx)(y,{someAttribute:!1,tone:`secondary`,children:`Shared plain section content`}),(0,o.jsx)(b,{localLabel:`local-label`,children:`Imported intersection section content`}),(0,o.jsx)(x,{focusIndex:2,children:`Focus index section content`}),(0,o.jsx)(S,{label:`pick-label`,children:`Pick section content`}),(0,o.jsx)(C,{label:`multi-label`,children:`Multi imported section content`}),(0,o.jsx)(w,{localLabel:`inherited-label`,children:`Inherited section content`}),(0,o.jsx)(T,{kind:`alpha`,onlyAlpha:1,children:`Union section content`}),(0,o.jsx)(E,{kind:`beta`,onlyBeta:`utility`,children:`Utility wrapped union section content`}),(0,o.jsx)(D,{detail:`branch`,kind:`alpha`,$tone:`warm`,children:`Transient union section content`}),(0,o.jsx)(O,{label:`method-label`,children:`Method section content`}),(0,o.jsx)(k,{$active:!0,label:`shared-transient-attrs`,children:`Shared transient attrs section content`}),(0,o.jsx)(A,{$active:!0,label:`shared-transient-plain`,children:`Shared transient plain section content`}),(0,o.jsx)(j,{children:`Scrollable content`}),(0,o.jsx)(M,{gutter:`stable`,children:`Type alias scrollable`}),(0,o.jsx)(N,{focusIndex:5,children:`Focus content`}),(0,o.jsx)(P,{children:`Box content`}),(0,o.jsx)(F,{children:`Aligned content`}),(0,o.jsx)(I,{children:`No wrapping text`}),(0,o.jsx)(L,{$height:50,children:`Dynamic height`}),(0,o.jsx)(R,{height:64,children:`Tile with attrs height`}),(0,o.jsx)(z,{children:`Optional height omitted`}),(0,o.jsx)(z,{height:24,children:`Optional height set`}),(0,o.jsx)(B,{children:`Mixed fallback height`}),(0,o.jsx)(U,{height:2,style:{opacity:1}}),(0,o.jsx)(H,{$height:4,children:`Fallback separator`}),(0,o.jsx)(G,{children:`Inherited attrs`}),(0,o.jsx)(K,{children:`Module scope style`}),(0,o.jsx)(J,{children:`Callback scope style`}),(0,o.jsx)(Y,{title:`Attrs icon size`}),(0,o.jsx)(X,{children:`Attrs sx`}),(0,o.jsx)(Z,{children:`Escaped template title (hover to see)`}),(0,o.jsx)(Q,{children:`Plain template title (hover to see)`})]});export{F as AlignedFlex,$ as App,p as Background,x as FocusIndexSection,N as FocusableScroll,g as HighlightSection,b as ImportedIntersectionSection,h as ImportedSection,w as InheritedSection,O as MethodSection,C as MultiImportedSection,S as PickSection,j as Scrollable,M as ScrollableWithType,m as Section,v as SharedAttrsSection,y as SharedPlainSection,k as SharedTransientAttrsSection,A as SharedTransientPlainSection,f as TextInput,D as TransientUnionSection,T as UnionSection,_ as UtilitySection,E as UtilityWrappedUnionSection};