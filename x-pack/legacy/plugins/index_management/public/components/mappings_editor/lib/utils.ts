/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */
import uuid from 'uuid';

import {
  DataType,
  Fields,
  Field,
  NormalizedFields,
  NormalizedField,
  FieldMeta,
  MainType,
  SubType,
  ChildFieldName,
  ParameterName,
} from '../types';

import {
  MAIN_DATA_TYPE_DEFINITION,
  MAX_DEPTH_DEFAULT_EDITOR,
  PARAMETERS_DEFINITION,
} from '../constants';

import { State } from '../reducer';
import { FieldConfig } from '../shared_imports';
import { TreeItem } from '../components/tree';

export const getUniqueId = () => {
  return uuid.v4();
};

const getChildFieldsName = (dataType: DataType): ChildFieldName | undefined => {
  if (dataType === 'text' || dataType === 'keyword') {
    return 'fields';
  } else if (dataType === 'object' || dataType === 'nested') {
    return 'properties';
  }
  return undefined;
};

export const getFieldMeta = (field: Field, isMultiField?: boolean): FieldMeta => {
  const childFieldsName = getChildFieldsName(field.type);

  const canHaveChildFields = isMultiField ? false : childFieldsName === 'properties';
  const hasChildFields = isMultiField
    ? false
    : canHaveChildFields &&
      Boolean(field[childFieldsName!]) &&
      Object.keys(field[childFieldsName!]!).length > 0;

  const canHaveMultiFields = isMultiField ? false : childFieldsName === 'fields';
  const hasMultiFields = isMultiField
    ? false
    : canHaveMultiFields &&
      Boolean(field[childFieldsName!]) &&
      Object.keys(field[childFieldsName!]!).length > 0;

  return {
    childFieldsName,
    canHaveChildFields,
    hasChildFields,
    canHaveMultiFields,
    hasMultiFields,
    isExpanded: false,
  };
};

export const getFieldConfig = (param: ParameterName, prop?: string): FieldConfig => {
  if (prop !== undefined) {
    if (
      !(PARAMETERS_DEFINITION[param] as any).props ||
      !(PARAMETERS_DEFINITION[param] as any).props[prop]
    ) {
      throw new Error(`No field config found for prop "${prop}" on param "${param}" `);
    }
    return (PARAMETERS_DEFINITION[param] as any).props[prop].fieldConfig || {};
  }

  return (PARAMETERS_DEFINITION[param] as any).fieldConfig || {};
};

/**
 * Return a map of subType -> mainType
 *
 * @example
 *
 * {
 *   long: 'numeric',
 *   integer: 'numeric',
 *   short: 'numeric',
 * }
 */
const subTypesMapToType = Object.entries(MAIN_DATA_TYPE_DEFINITION).reduce(
  (acc, [type, definition]) => {
    if ({}.hasOwnProperty.call(definition, 'subTypes')) {
      definition.subTypes!.types.forEach(subType => {
        acc[subType] = type;
      });
    }
    return acc;
  },
  {} as Record<SubType, string>
);

export const getMainTypeFromSubType = (subType: SubType): MainType =>
  subTypesMapToType[subType] as MainType;

/**
 * In order to better work with the recursive pattern of the mappings `properties`, this method flatten the fields
 * to a `byId` object where the key is the **path** to the field and the value is a `NormalizedField`.
 * The `NormalizedField` contains the field data under `source` and meta information about the capability of the field.
 *
 * @example

// original
{
  myObject: {
    type: 'object',
    properties: {
      name: {
        type: 'text'
      }
    }
  }
}

// normalized
{
  rootLevelFields: ['_uniqueId123'],
  byId: {
    '_uniqueId123': {
      source: { type: 'object' },
      id: '_uniqueId123',
      parentId: undefined,
      hasChildFields: true,
      childFieldsName: 'properties', // "object" type have their child fields under "properties"
      canHaveChildFields: true,
      childFields: ['_uniqueId456'],
    },
    '_uniqueId456': {
      source: { type: 'text' },
      id: '_uniqueId456',
      parentId: '_uniqueId123',
      hasChildFields: false,
      childFieldsName: 'fields', // "text" type have their child fields under "fields"
      canHaveChildFields: true,
      childFields: undefined,
    },
  },
}
 *
 * @param fieldsToNormalize The "properties" object from the mappings (or "fields" object for `text` and `keyword` types)
 */
export const normalize = (fieldsToNormalize: Fields): NormalizedFields => {
  let maxNestedDepth = 0;

  const normalizeFields = (
    props: Fields,
    to: NormalizedFields['byId'],
    paths: string[],
    idsArray: string[],
    nestedDepth: number,
    isMultiField: boolean = false,
    parentId?: string
  ): Record<string, any> =>
    Object.entries(props).reduce((acc, [propName, value]) => {
      const id = getUniqueId();
      idsArray.push(id);
      const field = { name: propName, ...value } as Field;
      const meta = getFieldMeta(field, isMultiField);
      const { childFieldsName, hasChildFields, hasMultiFields } = meta;

      if (hasChildFields || hasMultiFields) {
        const nextDepth =
          meta.canHaveChildFields || meta.canHaveMultiFields ? nestedDepth + 1 : nestedDepth;
        meta.childFields = [];
        maxNestedDepth = Math.max(maxNestedDepth, nextDepth);

        normalizeFields(
          field[childFieldsName!]!,
          to,
          [...paths, propName],
          meta.childFields,
          nextDepth,
          meta.canHaveMultiFields,
          id
        );
      }

      const { properties, fields, ...rest } = field;

      const normalizedField: NormalizedField = {
        id,
        parentId,
        nestedDepth,
        isMultiField,
        path: paths.length ? `${paths.join('.')}.${propName}` : propName,
        source: rest,
        ...meta,
      };

      acc[id] = normalizedField;

      return acc;
    }, to);

  const rootLevelFields: string[] = [];
  const byId = normalizeFields(fieldsToNormalize, {}, [], rootLevelFields, 0);

  return {
    byId,
    rootLevelFields,
    maxNestedDepth,
  };
};

export const deNormalize = (normalized: NormalizedFields): Fields => {
  const deNormalizePaths = (ids: string[], to: Fields = {}) => {
    ids.forEach(id => {
      const { source, childFields, childFieldsName } = normalized.byId[id];
      const { name, ...normalizedField } = source;
      const field: Omit<Field, 'name'> = normalizedField;
      to[name] = field;
      if (childFields) {
        field[childFieldsName!] = {};
        return deNormalizePaths(childFields, field[childFieldsName!]);
      }
    });
    return to;
  };

  return deNormalizePaths(normalized.rootLevelFields);
};

/**
 * If we change the "name" of a field, we need to update its `path` and the
 * one of **all** of its child properties or multi-fields.
 *
 * @param field The field who's name has changed
 * @param byId The map of all the document fields
 */
export const updateFieldsPathAfterFieldNameChange = (
  field: NormalizedField,
  byId: NormalizedFields['byId']
): { path: string; byId: NormalizedFields['byId'] } => {
  const updatedById = { ...byId };
  const paths = field.parentId ? byId[field.parentId].path.split('.') : [];

  const updateFieldPath = (_field: NormalizedField, _paths: string[]): void => {
    const { name } = _field.source;
    const path = _paths.length === 0 ? name : `${_paths.join('.')}.${name}`;

    updatedById[_field.id] = {
      ..._field,
      path,
    };

    if (_field.hasChildFields || _field.hasMultiFields) {
      _field
        .childFields!.map(fieldId => byId[fieldId])
        .forEach(childField => {
          updateFieldPath(childField, [..._paths, name]);
        });
    }
  };

  updateFieldPath(field, paths);

  return { path: updatedById[field.id].path, byId: updatedById };
};

/**
 * Retrieve recursively all the children fields of a field
 *
 * @param field The field to return the children from
 * @param byId Map of all the document fields
 */
export const getAllChildFields = (
  field: NormalizedField,
  byId: NormalizedFields['byId']
): NormalizedField[] => {
  const getChildFields = (_field: NormalizedField, to: NormalizedField[] = []) => {
    if (_field.hasChildFields || _field.hasMultiFields) {
      _field
        .childFields!.map(fieldId => byId[fieldId])
        .forEach(childField => {
          to.push(childField);
          getChildFields(childField, to);
        });
    }
    return to;
  };

  return getChildFields(field);
};

/**
 * Return the max nested depth of the document fields
 *
 * @param byId Map of all the document fields
 */
export const getMaxNestedDepth = (byId: NormalizedFields['byId']): number =>
  Object.values(byId).reduce((maxDepth, field) => {
    return Math.max(maxDepth, field.nestedDepth);
  }, 0);

/**
 * Create a nested array of fields and its possible children
 * to render a Tree view of them.
 */
export const buildFieldTreeFromIds = (
  fieldsIds: string[],
  byId: NormalizedFields['byId'],
  render: (field: NormalizedField) => JSX.Element | string
): TreeItem[] =>
  fieldsIds.map(id => {
    const field = byId[id];
    const children = field.childFields
      ? buildFieldTreeFromIds(field.childFields, byId, render)
      : undefined;

    return { label: render(field), children };
  });

/**
 * When changing the type of a field, in most cases we want to delete all its child fields.
 * There are some exceptions, when changing from "text" to "keyword" as both have the same "fields" property.
 */
export const shouldDeleteChildFieldsAfterTypeChange = (
  oldType: DataType,
  newType: DataType
): boolean => {
  if (oldType === 'text' && newType !== 'keyword') {
    return true;
  } else if (oldType === 'keyword' && newType !== 'text') {
    return true;
  } else if (oldType === 'object' && newType !== 'nested') {
    return true;
  } else if (oldType === 'nested' && newType !== 'object') {
    return true;
  }

  return false;
};

export const canUseMappingsEditor = (maxNestedDepth: number) =>
  maxNestedDepth < MAX_DEPTH_DEFAULT_EDITOR;

const stateWithValidity: Array<keyof State> = ['configuration', 'fieldsJsonEditor', 'fieldForm'];

export const isStateValid = (state: State): boolean | undefined =>
  Object.entries(state)
    .filter(([key]) => stateWithValidity.includes(key as keyof State))
    .reduce(
      (isValid, { 1: value }) => {
        if (value === undefined) {
          return isValid;
        }

        // If one section validity of the state is "undefined", the mappings validity is also "undefined"
        if (isValid === undefined || value.isValid === undefined) {
          return undefined;
        }

        return isValid && value.isValid;
      },
      true as undefined | boolean
    );
