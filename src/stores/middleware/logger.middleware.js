import { createLogger } from 'redux-logger'

const logger = createLogger({
});

export default logger;


//so you can create a logger manually or import redux-logger then specify options 

/*function logger({ getState }) {
  return next => action => {
    console.log('will dispatch', action)

    // Call the next dispatch method in the middleware chain.
    const returnValue = next(action)

    console.log('state after dispatch', getState())

    // This will likely be the action itself, unless
    // a middleware further in chain changed it.
    return returnValue
  }
}*/