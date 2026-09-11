import React, { useId } from 'react';

/**
 * Single shared form field for every modal. The visible caption becomes a
 * REAL associated <label> whenever the child is one input/select/textarea,
 * so screen readers announce a name (placeholders alone are not names, and
 * bare selects had none at all). Toggle/button groups keep a group caption.
 */
export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const id = useId();
  const kids = React.Children.toArray(children);
  const single =
    kids.length === 1 && React.isValidElement<{ id?: string }>(kids[0]) ? kids[0] : null;
  const tag = typeof single?.type === 'string' ? single.type : null;
  const labelable = tag === 'input' || tag === 'select' || tag === 'textarea';

  return (
    <div className="space-y-1.5">
      {labelable && single ? (
        <>
          <label htmlFor={id} className="text-xs font-bold text-(--ink-2)">
            {label}
          </label>
          {React.cloneElement(single, { id })}
        </>
      ) : (
        <>
          <span className="text-xs font-bold text-(--ink-2)">{label}</span>
          {children}
        </>
      )}
    </div>
  );
};
