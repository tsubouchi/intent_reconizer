import schema from './firestore-contract.json';

type PrimitiveType = 'string' | 'number' | 'boolean' | 'timestamp' | 'any';

type FieldDefinition =
  | { type: PrimitiveType; optional?: boolean }
  | { type: 'enum'; values: readonly string[]; optional?: boolean }
  | { type: 'array'; items: FieldDefinition; optional?: boolean }
  | { type: 'record'; value: FieldDefinition; optional?: boolean }
  | { type: 'object'; fields: Record<string, FieldDefinition>; optional?: boolean };

type ResolvePrimitive<T extends PrimitiveType> =
  T extends 'string'
    ? string
    : T extends 'number'
    ? number
    : T extends 'boolean'
    ? boolean
    : T extends 'timestamp'
    ? string
    : T extends 'any'
    ? unknown
    : never;

type BaseField<F extends FieldDefinition> = F extends { optional?: boolean }
  ? Omit<F, 'optional'>
  : F;

type ResolveField<F extends FieldDefinition> =
  BaseField<F> extends { type: infer T extends PrimitiveType }
    ? ResolvePrimitive<T>
    : BaseField<F> extends { type: 'enum'; values: readonly (infer V)[] }
    ? V
    : BaseField<F> extends { type: 'array'; items: infer Items extends FieldDefinition }
    ? ResolveField<Items>[]
    : BaseField<F> extends { type: 'record'; value: infer Value extends FieldDefinition }
    ? Record<string, ResolveField<Value>>
    : BaseField<F> extends { type: 'object'; fields: infer Fields extends Record<string, FieldDefinition> }
    ? { [K in keyof Fields]: ResolveValue<Fields[K]> }
    : never;

type ResolveValue<F extends FieldDefinition> = F extends { optional: true }
  ? ResolveField<BaseField<F>> | undefined
  : ResolveField<F>;

type DocumentType<S> = S extends { fields: infer Fields extends Record<string, FieldDefinition> }
  ? { [K in keyof Fields]: ResolveValue<Fields[K]> }
  : never;

type Collections = typeof schema.collections;

export type UISessionDocument = DocumentType<Collections['sessions']>;
export type UIIntentEventDocument = DocumentType<Collections['intentEvents']>;

export const uiContract = schema;
